const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
const DEFAULT_CODE_LENGTH = 4;

export function generateCode(length = DEFAULT_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}
