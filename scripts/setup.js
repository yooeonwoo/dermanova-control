import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.log('설정이 이미 있습니다. .env의 ADMIN_PASSWORD를 수정하면 비밀번호를 변경할 수 있습니다.');
} else {
  const password = randomBytes(18).toString('base64url');
  mkdirSync('.local', { recursive: true });
  writeFileSync('.env', `PORT=3000\nHOST=127.0.0.1\nADMIN_PASSWORD=${password}\n`, { mode: 0o600 });
  writeFileSync('.local/admin-password.txt', `더마노바 관제센터 관리자 비밀번호\n${password}\n\n이 파일과 .env는 공유하거나 Git에 올리지 마세요.\n`, { mode: 0o600 });
  console.log('설정 완료. 관리자 비밀번호는 .local/admin-password.txt에서 확인하세요.');
}
