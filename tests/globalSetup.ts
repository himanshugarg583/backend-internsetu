import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/internsetu_test?schema=public';
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });

  const root = path.resolve(__dirname, '.tmp-storage');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'templates'), { recursive: true });
  for (const t of ['offer-letter.txt', 'certificate.txt']) {
    fs.copyFileSync(path.resolve(__dirname, '../storage/templates', t), path.join(root, 'templates', t));
  }
  return () => fs.rmSync(root, { recursive: true, force: true });
}
