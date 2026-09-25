/**
 * ZeroGrid Validation Utilities
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// International standard phone regex: optional '+' followed by 7-15 digits, allows spaces, dashes, parens
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  // Ensure it has at least 7 actual digits
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;
  return PHONE_REGEX.test(phone.trim());
}

function isValidPastDate(dateInput) {
  if (!dateInput) return false;
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return false;
  const now = new Date();
  const minDate = new Date('1900-01-01T00:00:00.000Z');
  return date > minDate && date < now;
}

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidPastDate
};
