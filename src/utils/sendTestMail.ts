import { env } from '../config/env';
import { getTransporter, isEmailConfigured } from '../config/email';

async function main() {
  const targetEmail = process.argv[2] || 'himanshugarg3731@gmail.com';

  console.log('\n======================================================');
  console.log('       INTERNSETU SMTP & EMAIL DIAGNOSTIC TOOL        ');
  console.log('======================================================');
  console.log('Target Email :', targetEmail);
  console.log('SMTP Host    :', env.SMTP_HOST || '(NOT CONFIGURED)');
  console.log('SMTP Port    :', env.SMTP_PORT);
  console.log('SMTP Secure  :', env.SMTP_SECURE);
  console.log('SMTP User    :', env.SMTP_USER || '(NOT CONFIGURED)');
  console.log('Sender From  :', env.mailFrom);
  console.log('Password set :', Boolean(env.SMTP_PASS));
  console.log('------------------------------------------------------');

  if (!isEmailConfigured()) {
    console.error('❌ SMTP_HOST is not configured in .env! Emails will NOT be delivered.');
    process.exit(1);
  }

  const transporter = getTransporter();

  try {
    console.log('1. Verifying SMTP transport connection with server...');
    await transporter.verify();
    console.log('✅ SMTP connection and authentication successful!');

    console.log(`2. Sending test email to ${targetEmail}...`);
    const info = await transporter.sendMail({
      from: env.mailFrom,
      to: targetEmail,
      subject: 'InternSetu SMTP Test Mail',
      text: `Hello!\n\nThis is a verification test email from InternSetu.\nYour SMTP server is configured and working successfully!\n\nTimestamp: ${new Date().toISOString()}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; rounded: 8px;">
          <h2 style="color: #2563eb;">InternSetu SMTP Test</h2>
          <p>This is a confirmation test email from <strong>InternSetu</strong>.</p>
          <p style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px; color: #166534;">
            ✅ <strong>SMTP credentials are working properly!</strong>
          </p>
          <p style="font-size: 13px; color: #64748b;">Timestamp: ${new Date().toLocaleString()}</p>
        </div>
      `,
    });

    console.log('✅ Test email successfully sent!');
    console.log('Message ID :', info.messageId);
    console.log('Response   :', info.response);
    console.log('======================================================\n');
  } catch (err: any) {
    console.error('\n❌ SMTP Verification / Sending Failed!');
    console.error('Error Code   :', err.code || 'N/A');
    console.error('Error Message:', err.message || err);
    console.log('\n---------------- Troubleshooting Tips ----------------');
    if (err.message?.includes('535') || err.message?.includes('BadCredentials') || err.code === 'EAUTH') {
      console.log('• Gmail BadCredentials (535-5.7.8):');
      console.log('  1. Go to: https://myaccount.google.com/security');
      console.log('  2. Verify 2-Step Verification is ON.');
      console.log('  3. Open: https://myaccount.google.com/apppasswords');
      console.log('  4. Create a new App Password for "InternSetu".');
      console.log('  5. Update SMTP_PASS in backend-internsetu/.env with the new 16-letter code.');
    } else {
      console.log('• Check network connectivity and firewall/ISP restrictions on port ' + env.SMTP_PORT);
    }
    console.log('======================================================\n');
  }
}

main().catch(console.error);
