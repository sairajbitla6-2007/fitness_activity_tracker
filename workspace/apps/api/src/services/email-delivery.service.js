const nodemailer = require('nodemailer');
const { smtp } = require('../config/env');

function isConfigured() {
  const hasPartialCredentials = Boolean(smtp.user) !== Boolean(smtp.password);
  const encryptionIsEnabled = smtp.secure || smtp.requireTLS;
  const localDevelopmentRelay = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1', '::1'].includes(smtp.host);
  return Boolean(smtp.host && smtp.from)
    && !hasPartialCredentials
    && (encryptionIsEnabled || localDevelopmentRelay);
}

function createTransport() {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.requireTLS,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password } } : {}),
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
}

async function sendPasswordReset({ email, token }) {
  const resetUrl = `${smtp.resetScheme}://reset-password?token=${encodeURIComponent(token)}`;
  const transporter = createTransport();
  try {
    await transporter.sendMail({
      from: smtp.from,
      to: email,
      subject: 'Reset your Fitness Activity Tracker password',
      text: `Your password reset code is:\n\n${token}\n\nIn the app, choose Forgot password, then “I have a reset code,” and paste this code. It expires in 30 minutes and can only be used once.\n\nIf your email app can open app links, try this link instead:\n${resetUrl}\n\nIf you did not request a reset, you can ignore this email.`,
      html: `<p>Your password reset code is:</p><p><code>${token}</code></p><p>In the app, choose <strong>Forgot password</strong>, then <strong>I have a reset code</strong>, and paste this code. It expires in 30 minutes and can only be used once.</p><p>If your email app supports app links, you can also <a href="${resetUrl}">open the reset screen</a>.</p><p>If you did not request a reset, you can ignore this email.</p>`,
    });
  } finally {
    transporter.close();
  }
}

module.exports = { isConfigured, sendPasswordReset };
