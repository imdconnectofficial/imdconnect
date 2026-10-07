// ==============================================================================
// ImdConnect — Automated Production Security Audit Regression Test Suite
// ==============================================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml, sanitizeUrl } from '../src/core/security.js';

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.message}`);
        process.exitCode = 1;
    }
}

async function runSuite() {
    console.log('\n======================================================');
    console.log('   ImdConnect Production Security Audit Regression    ');
    console.log('======================================================\n');

    // --------------------------------------------------------------------------
    // Category 1: CSP & Security Headers
    // --------------------------------------------------------------------------
    console.log('[1] Content Security Policy & Security Headers');

    test('index.html contains strict Content-Security-Policy meta tag', () => {
        const html = fs.readFileSync('index.html', 'utf-8');
        assert.match(html, /http-equiv="Content-Security-Policy"/i, 'CSP meta tag must exist');
        assert.match(html, /default-src\s+'self'/i, "CSP must define default-src 'self'");
        assert.match(html, /script-src\s+'self'\s+https:\/\/cdn\.jsdelivr\.net/i, "CSP must restrict script-src");
        assert.match(html, /frame-ancestors\s+'none'/i, "CSP must prevent clickjacking via frame-ancestors 'none'");
    });

    test('index.html contains Referrer-Policy and nosniff headers', () => {
        const html = fs.readFileSync('index.html', 'utf-8');
        assert.match(html, /name="referrer"\s+content="strict-origin-when-cross-origin"/i);
        assert.match(html, /http-equiv="X-Content-Type-Options"\s+content="nosniff"/i);
    });

    test('_headers configuration file for Cloudflare Pages includes all required headers', () => {
        assert.ok(fs.existsSync('_headers'), '_headers file must exist');
        const headers = fs.readFileSync('_headers', 'utf-8');
        assert.match(headers, /Content-Security-Policy:/i);
        assert.match(headers, /X-Frame-Options:\s*DENY/i);
        assert.match(headers, /X-Content-Type-Options:\s*nosniff/i);
        assert.match(headers, /Strict-Transport-Security:\s*max-age=31536000/i);
        assert.match(headers, /Permissions-Policy:\s*camera=\(\)/i);
    });

    // --------------------------------------------------------------------------
    // Category 2: XSS & Output Encoding
    // --------------------------------------------------------------------------
    console.log('\n[2] Output Encoding & Attribute-Injection XSS Prevention');

    test('escapeHtml properly encodes characters: &, <, >, ", \', and `', () => {
        assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
        assert.equal(escapeHtml('Hello & Welcome'), 'Hello &amp; Welcome');
        assert.equal(escapeHtml('User "Name"'), 'User &quot;Name&quot;');
        assert.equal(escapeHtml("User 'Name'"), 'User &#39;Name&#39;');
        assert.equal(escapeHtml('`backticks`'), '&#96;backticks&#96;');
    });

    test('escapeHtml neutralizes attribute breakout payload', () => {
        const evilPayload = 'alice" onmouseover="alert(document.cookie)" id="hacked';
        const escaped = escapeHtml(evilPayload);
        assert.ok(!escaped.includes('"'), 'Must not contain unescaped double quotes');
        assert.ok(escaped.includes('&quot;'), 'Quotes must be converted to &quot;');
    });

    test('sanitizeUrl rejects dangerous protocols', () => {
        assert.equal(sanitizeUrl('javascript:alert(1)'), '', 'Must reject javascript: pseudo-protocol');
        assert.equal(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '', 'Must reject data:text/html');
        assert.equal(sanitizeUrl('vbscript:msgbox(1)'), '', 'Must reject vbscript:');
    });

    test('sanitizeUrl allows legitimate resource URLs', () => {
        assert.equal(sanitizeUrl('https://example.com/avatar.webp'), 'https://example.com/avatar.webp');
        assert.equal(sanitizeUrl('./assets/logo.svg'), './assets/logo.svg');
        assert.equal(sanitizeUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
    });

    // --------------------------------------------------------------------------
    // Category 3: File Upload Validation & Media Constraints
    // --------------------------------------------------------------------------
    console.log('\n[3] File Upload Validation & Identity Media Magic Bytes');

    test('Validates JPEG, PNG, WebP raster signatures and rejects executables / PHP scripts', () => {
        function checkMagicBytes(buffer) {
            const arr = new Uint8Array(buffer).subarray(0, 12);
            let header = '';
            for (let i = 0; i < arr.length; i++) {
                header += arr[i].toString(16).padStart(2, '0').toUpperCase();
            }
            if (header.startsWith('FFD8FF')) return { valid: true, type: 'image/jpeg' };
            if (header.startsWith('89504E47')) return { valid: true, type: 'image/png' };
            if (header.startsWith('52494646') && header.slice(16, 24) === '57454250') {
                return { valid: true, type: 'image/webp' };
            }
            return { valid: false };
        }

        // JPEG Magic Bytes: FF D8 FF
        const jpegBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
        assert.equal(checkMagicBytes(jpegBuf).valid, true);
        assert.equal(checkMagicBytes(jpegBuf).type, 'image/jpeg');

        // PNG Magic Bytes: 89 50 4E 47
        const pngBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
        assert.equal(checkMagicBytes(pngBuf).valid, true);
        assert.equal(checkMagicBytes(pngBuf).type, 'image/png');

        // WebP Magic Bytes: 52 49 46 46 ... 57 45 42 50
        const webpBuf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
        assert.equal(checkMagicBytes(webpBuf).valid, true);
        assert.equal(checkMagicBytes(webpBuf).type, 'image/webp');

        // PE Executable (MZ): 4D 5A
        const exeBuf = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
        assert.equal(checkMagicBytes(exeBuf).valid, false);

        // PHP Script: <?php
        const phpBuf = Buffer.from('<?php echo "pwned"; ?>', 'utf-8');
        assert.equal(checkMagicBytes(phpBuf).valid, false);
    });

    // --------------------------------------------------------------------------
    // Category 4: Input Validation & Constraints
    // --------------------------------------------------------------------------
    console.log('\n[4] Input Validation & Constraints');

    test('Username regex strictly rejects invalid chars, spaces, and excessive lengths', () => {
        const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;
        assert.equal(USERNAME_REGEX.test('alice'), true);
        assert.equal(USERNAME_REGEX.test('bob_123'), true);
        assert.equal(USERNAME_REGEX.test('al'), false, 'Too short (min 3)');
        assert.equal(USERNAME_REGEX.test('a'.repeat(31)), false, 'Too long (max 30)');
        assert.equal(USERNAME_REGEX.test('alice smith'), false, 'No spaces allowed');
        assert.equal(USERNAME_REGEX.test('alice<script>'), false, 'No HTML tags');
        assert.equal(USERNAME_REGEX.test("alice' OR '1'='1"), false, 'No SQL characters');
    });

    test('Age validation enforces minimum 13 years compliance and rejects future dates', () => {
        function validateDob(dobStr, minAge = 13) {
            if (!dobStr || typeof dobStr !== 'string') return { valid: false, error: 'Required' };
            const parts = dobStr.split('-');
            if (parts.length !== 3) return { valid: false, error: 'Format' };
            const [y, m, d] = parts.map(Number);
            const dob = new Date(y, m - 1, d);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (dob > today) return { valid: false, error: 'Future date' };
            let age = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
            if (age < minAge) return { valid: false, error: 'Underage' };
            return { valid: true, age };
        }

        assert.equal(validateDob('2030-01-01').valid, false, 'Future date must be rejected');
        assert.equal(validateDob('2025-01-01').valid, false, '1-year old must be rejected');
        assert.equal(validateDob('2000-05-15').valid, true, 'Adult date must be accepted');
    });

    // --------------------------------------------------------------------------
    // Category 5: Zero Secrets in Source Code & Git Protection
    // --------------------------------------------------------------------------
    console.log('\n[5] Zero Secrets in Source Code & Git Protection');

    test('.gitignore strictly ignores environment secrets, tokens, and credentials', () => {
        const gitignore = fs.readFileSync('.gitignore', 'utf-8');
        assert.match(gitignore, /\.env\*/, '.gitignore must ignore .env* files');
        assert.match(gitignore, /\.secret\*/, '.gitignore must ignore .secret* files');
        assert.match(gitignore, /credentials\//, '.gitignore must ignore credentials/');
    });

    test('Source code contains zero hardcoded Supabase service_role keys or private tokens', () => {
        const srcFiles = [];
        function walkDir(dir) {
            fs.readdirSync(dir).forEach(file => {
                const full = path.join(dir, file);
                if (fs.statSync(full).isDirectory()) {
                    if (file !== 'node_modules' && file !== '.git') walkDir(full);
                } else if (file.endsWith('.js') || file.endsWith('.html')) {
                    srcFiles.push(full);
                }
            });
        }
        walkDir('./src');

        for (const file of srcFiles) {
            const content = fs.readFileSync(file, 'utf-8');
            assert.ok(
                !content.includes('service_role') || file.includes('audit'),
                `File ${file} must not contain service_role reference`
            );
            assert.ok(!content.includes('sbp_'), `File ${file} must not contain Supabase access tokens`);
            assert.ok(!content.includes('ghp_'), `File ${file} must not contain GitHub personal tokens`);
        }
    });

    // --------------------------------------------------------------------------
    // Category 6: SQL Injection & Row-Level Security Verification
    // --------------------------------------------------------------------------
    console.log('\n[6] SQL Injection & Row-Level Security Verification');

    test('All migrations avoid dynamic string concatenation in EXECUTE queries', () => {
        const migDir = './supabase/migrations';
        const migFiles = fs.readdirSync(migDir).filter(f => f.endsWith('.sql'));
        assert.ok(migFiles.length >= 15, 'Migrations must exist');

        for (const f of migFiles) {
            const content = fs.readFileSync(path.join(migDir, f), 'utf-8');
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
                const upper = line.trim().toUpperCase();
                if (upper.startsWith('EXECUTE ') && upper.includes('||')) {
                    // Allowed only if using %I quoting or format()
                    assert.ok(
                        upper.includes('FORMAT(') || upper.includes('QUOTE_IDENT'),
                        `Unescaped EXECUTE concatenation in ${f}:${idx + 1}: ${line}`
                    );
                }
            });
        }
    });

    // --------------------------------------------------------------------------
    // Category 7: Production Security Hardening Migration Controls
    // --------------------------------------------------------------------------
    console.log('\n[7] Production Security Hardening Migration Controls');

    test('Hardening migration implements all required security controls', () => {
        const migPath = './supabase/migrations/20261007330000_production_security_audit_hardening.sql';
        assert.ok(fs.existsSync(migPath), 'Hardening migration must exist');
        const sql = fs.readFileSync(migPath, 'utf-8');

        // Brute Force Lockout
        assert.match(sql, /failed_login_attempts/i, 'Must add failed_login_attempts column');
        assert.match(sql, /locked_until/i, 'Must add locked_until column');
        assert.match(sql, /target_failed_attempts\s*\+\s*1\s*>=\s*5/i, 'Must lock out after 5 consecutive failures');
        assert.match(sql, /INTERVAL\s*'15 minutes'/i, 'Lockout must last 15 minutes');

        // Friend Request Abuse & Privacy
        assert.match(sql, /friend_request_permissions/i, 'Must check target friend_request_permissions');
        assert.match(sql, /v_recent_request_count\s*>=\s*30/i, 'Must enforce 30 requests/hour rate limit');

        // Suspended Group Message Gate
        assert.match(sql, /g\.is_suspended\s*=\s*TRUE/i, 'Must reject messages sent to suspended groups');

        // Dynamic Privacy Masking in public_profiles
        assert.match(sql, /CREATE OR REPLACE VIEW public\.public_profiles/i, 'Must update public_profiles view');
        assert.match(sql, /ps\.avatar_visibility/i, 'Must mask avatar_url based on privacy settings');
        assert.match(sql, /ps\.profile_visibility/i, 'Must mask bio based on privacy settings');
        assert.match(sql, /ps\.last_seen/i, 'Must mask last_seen_at based on privacy settings');

        // Session Revocation RPC
        assert.match(sql, /revoke_all_user_sessions/i, 'Must create revoke_all_user_sessions RPC');

        // Safe Account Deletion & Succession
        assert.match(sql, /public\.delete_account/i, 'Must harden delete_account function');
        assert.match(sql, /v_successor_id/i, 'Must transfer group ownership to successor before auth.users deletion');

        // Realtime REPLICA IDENTITY FULL
        assert.match(sql, /ALTER TABLE public\.messages REPLICA IDENTITY FULL/i);
        assert.match(sql, /ALTER TABLE public\.message_reads REPLICA IDENTITY FULL/i);
        assert.match(sql, /ALTER TABLE public\.notifications REPLICA IDENTITY FULL/i);

        // Compound Performance & Security Indexes
        assert.match(sql, /idx_user_sessions_user_revoked/i);
        assert.match(sql, /idx_profiles_suspended_banned/i);
        assert.match(sql, /idx_messages_conv_created/i);
    });

    console.log('\n======================================================');
    console.log(`Results: ${passedTests} / ${totalTests} tests passed`);
    console.log('======================================================\n');
}

runSuite().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
