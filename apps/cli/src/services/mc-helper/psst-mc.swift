import AVFoundation
import Foundation
import MultipeerConnectivity

// psst-mc: one native Swift process that does mic capture + MC transport +
// speaker output in-process. No subprocess audio I/O — everything stays in
// CoreAudio and libdispatch. Targeting sub-20 ms mouth-to-ear on a
// same-LAN MC link.
//
// Usage: psst-mc <room-code>
// Exits on SIGTERM or when the MC peer disconnects.

let SAMPLE_RATE: Double = 48_000
let CHANNELS: AVAudioChannelCount = 1
let FRAMES_PER_PACKET: AVAudioFrameCount = 128  // ~2.7 ms @ 48 kHz

func logErr(_ msg: String) {
    FileHandle.standardError.write("[psst-mc] \(msg)\n".data(using: .utf8)!)
}

guard CommandLine.arguments.count >= 2 else {
    logErr("usage: psst-mc <room-code>")
    exit(2)
}

let room = CommandLine.arguments[1].lowercased()
let serviceType = "psst"
let discoveryInfo = ["room": room]

let hostName = Host.current().localizedName ?? "psst"
let suffix = String(UUID().uuidString.prefix(6))
let localPeer = MCPeerID(displayName: String("\(hostName)-\(suffix)".prefix(63)))

let session = MCSession(
    peer: localPeer,
    securityIdentity: nil,
    encryptionPreference: .required
)

// -----------------------------------------------------------------------
// Lock-free-ish ring buffer for incoming PCM float frames. Writer is the
// MC callback thread, reader is the audio render thread. A lock is fine
// here because our frame chunks are tiny and contention is minimal.
// -----------------------------------------------------------------------

final class PcmRingBuffer {
    private var storage: [Float]
    private let capacity: Int
    private var writeIdx = 0
    private var readIdx = 0
    private var available = 0
    private let lock = NSLock()

    init(capacitySeconds: Double) {
        self.capacity = Int(SAMPLE_RATE * capacitySeconds) * Int(CHANNELS)
        self.storage = Array(repeating: 0, count: self.capacity)
    }

    func write(_ samples: UnsafePointer<Float>, count: Int) {
        lock.lock(); defer { lock.unlock() }
        for i in 0 ..< count {
            storage[writeIdx] = samples[i]
            writeIdx = (writeIdx + 1) % capacity
            if available < capacity {
                available += 1
            } else {
                // Overflow: advance reader to make room — drops oldest samples.
                readIdx = (readIdx + 1) % capacity
            }
        }
    }

    /// Read up to `count` samples into `dest`. Returns how many were produced;
    /// the rest is zero-filled (silence) by the caller as needed.
    func read(_ dest: UnsafeMutablePointer<Float>, count: Int) -> Int {
        lock.lock(); defer { lock.unlock() }
        let toRead = min(count, available)
        for i in 0 ..< toRead {
            dest[i] = storage[readIdx]
            readIdx = (readIdx + 1) % capacity
        }
        available -= toRead
        return toRead
    }
}

let playbackRing = PcmRingBuffer(capacitySeconds: 0.25)  // 250 ms safety

// -----------------------------------------------------------------------
// MC session glue
// -----------------------------------------------------------------------

final class Runner: NSObject, MCSessionDelegate,
                         MCNearbyServiceAdvertiserDelegate,
                         MCNearbyServiceBrowserDelegate {
    let session: MCSession
    let room: String
    let advertiser: MCNearbyServiceAdvertiser
    let browser: MCNearbyServiceBrowser
    var connected: MCPeerID?
    weak var onConnected: AudioBridge?

    init(session: MCSession, serviceType: String, room: String, discoveryInfo: [String: String]) {
        self.session = session
        self.room = room
        self.advertiser = MCNearbyServiceAdvertiser(
            peer: session.myPeerID,
            discoveryInfo: discoveryInfo,
            serviceType: serviceType
        )
        self.browser = MCNearbyServiceBrowser(
            peer: session.myPeerID,
            serviceType: serviceType
        )
        super.init()
        session.delegate = self
        advertiser.delegate = self
        browser.delegate = self
    }

    func start() {
        advertiser.startAdvertisingPeer()
        browser.startBrowsingForPeers()
    }

    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        switch state {
        case .connected:
            logErr("connected to \(peerID.displayName)")
            connected = peerID
            onConnected?.sendPeer = peerID
        case .connecting:
            logErr("connecting to \(peerID.displayName)")
        case .notConnected:
            logErr("disconnected from \(peerID.displayName)")
            if connected == peerID {
                connected = nil
                onConnected?.sendPeer = nil
                exit(0)
            }
        @unknown default:
            break
        }
    }

    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        // Interpret as packed Float32 samples. Write into the playback ring.
        let count = data.count / MemoryLayout<Float>.size
        if count == 0 { return }
        data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            guard let ptr = raw.bindMemory(to: Float.self).baseAddress else { return }
            playbackRing.write(ptr, count: count)
        }
    }

    func session(_ session: MCSession, didReceiveCertificate certificate: [Any]?, fromPeer peerID: MCPeerID, certificateHandler: @escaping (Bool) -> Void) {
        certificateHandler(true)
    }
    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}

    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        invitationHandler(connected == nil, connected == nil ? session : nil)
    }
    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
        logErr("advertiser error: \(error.localizedDescription)")
    }

    func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        guard peerID != session.myPeerID, connected == nil else { return }
        guard info?["room"] == room else { return }
        if session.myPeerID.displayName < peerID.displayName {
            logErr("inviting \(peerID.displayName)")
            browser.invitePeer(peerID, to: session, withContext: nil, timeout: 30)
        }
    }
    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {}
    func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        logErr("browser error: \(error.localizedDescription)")
    }
}

// -----------------------------------------------------------------------
// Audio bridge: AVAudioEngine for mic + output, connects to MCSession.
// -----------------------------------------------------------------------

final class AudioBridge {
    let engine = AVAudioEngine()
    let session: MCSession
    var sendPeer: MCPeerID?

    // Format used on the wire: 48 kHz mono, 32-bit float, interleaved.
    let wireFormat: AVAudioFormat

    init(session: MCSession) {
        self.session = session
        guard let fmt = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: SAMPLE_RATE,
            channels: CHANNELS,
            interleaved: true
        ) else {
            fatalError("could not build wire format")
        }
        self.wireFormat = fmt
    }

    func start() throws {
        let input = engine.inputNode
        let output = engine.outputNode

        // Source node that pulls from the playback ring buffer.
        let source = AVAudioSourceNode(format: wireFormat) { _, _, frameCount, audioBufferList -> OSStatus in
            let abl = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard let buf = abl[0].mData?.assumingMemoryBound(to: Float.self) else {
                return noErr
            }
            let count = Int(frameCount)
            let produced = playbackRing.read(buf, count: count)
            if produced < count {
                // Zero-fill the rest to avoid audible garbage on underrun.
                for i in produced ..< count { buf[i] = 0 }
            }
            return noErr
        }
        engine.attach(source)
        engine.connect(source, to: output, format: wireFormat)

        // Install the mic tap. Use a buffer size small enough to match our
        // target latency; CoreAudio may round this up to the hardware
        // minimum but 128 is the floor we're asking for.
        input.installTap(
            onBus: 0,
            bufferSize: FRAMES_PER_PACKET,
            format: input.outputFormat(forBus: 0)
        ) { [weak self] buffer, _ in
            self?.handleMicBuffer(buffer)
        }

        try engine.start()
        logErr("audio engine started (input=\(input.outputFormat(forBus: 0)))")
    }

    private func handleMicBuffer(_ buffer: AVAudioPCMBuffer) {
        // Convert mic buffer → wire format (mono 48 kHz float) if needed,
        // then send as raw bytes over MC .unreliable.
        guard let peer = sendPeer else { return }
        let micFormat = buffer.format
        let converted: AVAudioPCMBuffer
        if micFormat == wireFormat {
            converted = buffer
        } else {
            guard let converter = AVAudioConverter(from: micFormat, to: wireFormat) else {
                return
            }
            let ratio = wireFormat.sampleRate / micFormat.sampleRate
            let outFrameCount = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 0.5)
            guard let out = AVAudioPCMBuffer(
                pcmFormat: wireFormat,
                frameCapacity: max(outFrameCount, 1)
            ) else { return }
            var error: NSError?
            var consumed = false
            _ = converter.convert(to: out, error: &error) { _, status in
                if consumed {
                    status.pointee = .noDataNow
                    return nil
                }
                consumed = true
                status.pointee = .haveData
                return buffer
            }
            if error != nil { return }
            converted = out
        }

        let frameCount = Int(converted.frameLength)
        if frameCount == 0 { return }
        guard let raw = converted.floatChannelData?[0] else { return }
        let byteCount = frameCount * MemoryLayout<Float>.size
        let data = Data(bytes: raw, count: byteCount)
        do {
            try session.send(data, toPeers: [peer], with: .unreliable)
        } catch {
            // drop on failure — unreliable is fine
        }
    }
}

// -----------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------

let runner = Runner(
    session: session,
    serviceType: serviceType,
    room: room,
    discoveryInfo: discoveryInfo
)
let bridge = AudioBridge(session: session)
runner.onConnected = bridge

do {
    try bridge.start()
} catch {
    logErr("failed to start audio engine: \(error.localizedDescription)")
    exit(3)
}

runner.start()
logErr("service=\(serviceType) peer=\(localPeer.displayName)")

RunLoop.main.run()
