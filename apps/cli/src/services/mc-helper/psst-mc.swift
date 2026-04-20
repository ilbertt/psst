import Foundation
import MultipeerConnectivity

// Protocol on stdin/stdout: 2-byte big-endian length prefix, then payload.
// Each payload is one RTP packet (or any opaque blob the caller chose).
//
// Arguments:
//   psst-mc <room-code>
//
// The room code becomes the MC service type, so only peers with the same
// code discover each other.

func logErr(_ msg: String) {
    FileHandle.standardError.write("[psst-mc] \(msg)\n".data(using: .utf8)!)
}

guard CommandLine.arguments.count >= 2 else {
    logErr("usage: psst-mc <room-code>")
    exit(2)
}

let room = CommandLine.arguments[1].lowercased()
// MC service types: 1–15 chars, [a-z0-9-], must start with letter.
let serviceType = String("psst-\(room)".prefix(15))

let hostName = Host.current().localizedName ?? "psst"
// Always append a random suffix so two machines with the same hostname
// (common when the same user owns both) get distinct displayNames — our
// tiebreak on invites relies on them being orderable.
let suffix = String(UUID().uuidString.prefix(6))
let localPeer = MCPeerID(displayName: String("\(hostName)-\(suffix)".prefix(63)))

let session = MCSession(
    peer: localPeer,
    securityIdentity: nil,
    encryptionPreference: .none
)

final class Runner: NSObject, MCSessionDelegate,
                         MCNearbyServiceAdvertiserDelegate,
                         MCNearbyServiceBrowserDelegate {
    let session: MCSession
    let advertiser: MCNearbyServiceAdvertiser
    let browser: MCNearbyServiceBrowser
    var connected: MCPeerID?
    let stdoutLock = NSLock()

    init(session: MCSession, serviceType: String) {
        self.session = session
        self.advertiser = MCNearbyServiceAdvertiser(
            peer: session.myPeerID,
            discoveryInfo: nil,
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
        DispatchQueue.global(qos: .userInitiated).async { self.readStdinLoop() }
    }

    func readStdinLoop() {
        let stdin = FileHandle.standardInput
        var buffer = Data()
        let lengthBytes = 2
        while true {
            while buffer.count < lengthBytes {
                let chunk = stdin.availableData
                if chunk.isEmpty {
                    logErr("stdin closed, exiting")
                    exit(0)
                }
                buffer.append(chunk)
            }
            let len = (UInt16(buffer[0]) << 8) | UInt16(buffer[1])
            let needed = Int(len) + lengthBytes
            while buffer.count < needed {
                let chunk = stdin.availableData
                if chunk.isEmpty {
                    logErr("stdin closed mid-frame, exiting")
                    exit(0)
                }
                buffer.append(chunk)
            }
            let payload = buffer.subdata(in: lengthBytes ..< needed)
            buffer.removeSubrange(0 ..< needed)
            if let peer = connected {
                do {
                    try session.send(payload, toPeers: [peer], with: .unreliable)
                } catch {
                    // Don't spam stderr on every dropped packet.
                }
            }
        }
    }

    func writeFrame(_ data: Data) {
        stdoutLock.lock()
        defer { stdoutLock.unlock() }
        var len = UInt16(data.count).bigEndian
        let header = Data(bytes: &len, count: 2)
        FileHandle.standardOutput.write(header)
        FileHandle.standardOutput.write(data)
    }

    // MARK: - MCSessionDelegate

    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        switch state {
        case .connected:
            logErr("connected to \(peerID.displayName)")
            connected = peerID
        case .connecting:
            logErr("connecting to \(peerID.displayName)")
        case .notConnected:
            logErr("disconnected from \(peerID.displayName)")
            if connected == peerID {
                connected = nil
                exit(0)
            }
        @unknown default:
            break
        }
    }

    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        writeFrame(data)
    }

    func session(_ session: MCSession, didReceiveCertificate certificate: [Any]?, fromPeer peerID: MCPeerID, certificateHandler: @escaping (Bool) -> Void) {
        certificateHandler(true)
    }

    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}

    // MARK: - Advertiser

    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        logErr("invitation from \(peerID.displayName) (connected=\(connected?.displayName ?? "nil"))")
        if connected == nil {
            logErr("accepting invite from \(peerID.displayName)")
            invitationHandler(true, session)
        } else {
            logErr("rejecting invite from \(peerID.displayName) — already connected")
            invitationHandler(false, nil)
        }
    }

    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
        logErr("advertiser error: \(error.localizedDescription)")
    }

    func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        logErr("browser error: \(error.localizedDescription)")
    }

    // MARK: - Browser

    func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String : String]?) {
        guard peerID != session.myPeerID, connected == nil else { return }
        // Deterministic tie-break so only one side invites: lexicographically
        // smaller displayName invites.
        if session.myPeerID.displayName < peerID.displayName {
            logErr("inviting \(peerID.displayName)")
            browser.invitePeer(peerID, to: session, withContext: nil, timeout: 30)
        }
    }

    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        logErr("lost peer \(peerID.displayName)")
    }
}

let runner = Runner(session: session, serviceType: serviceType)
runner.start()
logErr("service=\(serviceType) peer=\(localPeer.displayName)")

RunLoop.main.run()
