<?php
/**
 * send-mail.php — contact form handler for kapriol.bg
 *
 * Accepts a JSON (or form-encoded) POST with: name, email, phone, message, website.
 * - "website" is a honeypot: if it is filled, we return success WITHOUT sending.
 * - Validates every field server-side; email must be a valid address.
 * - Sends to info@kapriol.bg via PHP mail().
 * - Always responds with JSON: {"success":true} or {"success":false,"error":"..."}.
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// ---- Config ---------------------------------------------------------------
$TO      = 'info@kapriol.bg';
$SUBJECT = 'New enquiry from kapriol.bg';
// From must be a domain mailbox for SPF/DKIM deliverability on cPanel hosting.
$FROM    = 'no-reply@kapriol.bg';

// ---- Method guard ---------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(array('success' => false, 'error' => 'Method not allowed.'));
    exit;
}

// ---- Read input (JSON first, fall back to form-encoded) --------------------
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

function field($data, $key) {
    return isset($data[$key]) ? trim((string) $data[$key]) : '';
}

$name    = field($data, 'name');
$email   = field($data, 'email');
$phone   = field($data, 'phone');
$message = field($data, 'message');
$website = field($data, 'website'); // honeypot

// ---- Honeypot: pretend success, send nothing ------------------------------
if ($website !== '') {
    echo json_encode(array('success' => true));
    exit;
}

// ---- Validate -------------------------------------------------------------
if ($name === '' || $phone === '' || $message === '' ||
    !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(array(
        'success' => false,
        'error'   => 'Please complete every field with a valid email address.'
    ));
    exit;
}

// Basic abuse guard.
if (mb_strlen($message) > 5000 || mb_strlen($name) > 200) {
    http_response_code(422);
    echo json_encode(array('success' => false, 'error' => 'Message is too long.'));
    exit;
}

// ---- Build the mail -------------------------------------------------------
// Strip CR/LF from anything that lands in a header to prevent header injection.
$safeName  = preg_replace('/[\r\n]+/', ' ', $name);
$safeEmail = preg_replace('/[\r\n]+/', ' ', $email);

$body =
    "New enquiry from the kapriol.bg website\n" .
    "----------------------------------------\n\n" .
    "Name:    " . $name . "\n" .
    "Email:   " . $email . "\n" .
    "Phone:   " . $phone . "\n\n" .
    "Message:\n" . $message . "\n";

$headers  = 'From: Kapriol.bg <' . $FROM . ">\r\n";
$headers .= 'Reply-To: ' . $safeName . ' <' . $safeEmail . ">\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=utf-8\r\n";

// RFC 2047-encode the subject so UTF-8 stays intact.
$encodedSubject = '=?UTF-8?B?' . base64_encode($SUBJECT) . '?=';

$sent = @mail($TO, $encodedSubject, $body, $headers);

if ($sent) {
    echo json_encode(array('success' => true));
} else {
    http_response_code(500);
    echo json_encode(array(
        'success' => false,
        'error'   => 'Mail could not be sent right now. Please email info@kapriol.bg directly.'
    ));
}
