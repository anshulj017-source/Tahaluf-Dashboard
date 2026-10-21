export function getSmtpTransportConfig(environment = process.env) {
  const host = environment.SMTP_HOST?.trim();
  const portValue = environment.SMTP_PORT?.trim();
  const user = environment.SMTP_USER?.trim();
  const pass = environment.SMTP_PASS?.replace(/\s/g, '');
  const missing = [
    !host && 'SMTP_HOST',
    !portValue && 'SMTP_PORT',
    !user && 'SMTP_USER',
    !pass && 'SMTP_PASS'
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Email notifications require ${missing.join(', ')} to be configured.`);
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid port number.');
  }

  return {
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass }
  };
}
