// raw-contact-supabase-service.js - Supabase raw capture persistence adapter
const https = require('https');
const config = require('./config');

const TABLE_NAME = 'raw_contact_captures';

class SupabasePersistenceError extends Error {
    constructor(message, category, details = {}) {
        super(message);
        this.name = 'SupabasePersistenceError';
        this.category = category;
        this.statusCode = details.statusCode;
        this.supabaseCode = details.supabaseCode;
        this.conflictTarget = details.conflictTarget;
    }
}

class RawContactSupabaseService {
    constructor(options = {}) {
        this.supabaseUrl = options.supabaseUrl || config.SUPABASE_URL;
        this.serviceRoleKey = options.serviceRoleKey || config.SUPABASE_SERVICE_ROLE_KEY;
        this.tableName = TABLE_NAME;
    }

    validateConfig() {
        if (!this.supabaseUrl || !this.serviceRoleKey) {
            throw new SupabasePersistenceError(
                'Supabase configuration is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
                'configuration'
            );
        }
    }

    async findBySourceMessageId(sourceMessageId) {
        this.validateConfig();
        if (!sourceMessageId) {
            throw new SupabasePersistenceError('source_message_id is required.', 'validation');
        }

        const encodedMessageId = encodeURIComponent(sourceMessageId);
        const query = `source_message_id=eq.${encodedMessageId}&select=card_id,source_message_id,drive_file_id&limit=2`;
        const rows = await this.request('GET', query);

        if (rows.length === 0) return null;
        if (rows.length > 1) {
            throw new SupabasePersistenceError(
                'Multiple captures found for one source_message_id.',
                'validation'
            );
        }
        return rows[0];
    }

    async insertCapture(payload) {
        this.validateConfig();
        if (!payload || !payload.source_message_id || !payload.drive_file_id || !payload.card_id) {
            throw new SupabasePersistenceError('Capture payload is missing required identity fields.', 'validation');
        }

        const rows = await this.request('POST', '', payload, {
            Prefer: 'return=representation'
        });

        if (!Array.isArray(rows) || rows.length !== 1) {
            throw new SupabasePersistenceError('Supabase insert did not return exactly one row.', 'unknown');
        }

        return rows[0];
    }

    request(method, query = '', body = null, extraHeaders = {}) {
        this.validateConfig();

        return new Promise((resolve, reject) => {
            let endpoint;
            try {
                const baseUrl = this.supabaseUrl.replace(/\/+$/, '');
                endpoint = new URL(`${baseUrl}/rest/v1/${this.tableName}${query ? `?${query}` : ''}`);
            } catch (error) {
                reject(new SupabasePersistenceError('SUPABASE_URL is invalid.', 'configuration'));
                return;
            }

            const requestBody = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
            const headers = {
                apikey: this.serviceRoleKey,
                Authorization: `Bearer ${this.serviceRoleKey}`,
                Accept: 'application/json',
                ...extraHeaders
            };

            if (requestBody) {
                headers['Content-Type'] = 'application/json';
                headers['Content-Length'] = requestBody.length;
            }

            const req = https.request({
                hostname: endpoint.hostname,
                path: `${endpoint.pathname}${endpoint.search}`,
                method,
                headers
            }, (res) => {
                let responseData = '';
                res.setEncoding('utf8');
                res.on('data', chunk => { responseData += chunk; });
                res.on('end', () => {
                    const statusCode = res.statusCode || 0;
                    let parsed = null;

                    if (responseData) {
                        try {
                            parsed = JSON.parse(responseData);
                        } catch (error) {
                            reject(new SupabasePersistenceError('Supabase returned invalid JSON.', 'unknown', { statusCode }));
                            return;
                        }
                    }

                    if (statusCode >= 200 && statusCode < 300) {
                        resolve(parsed || []);
                        return;
                    }

                    reject(this.toPersistenceError(statusCode, parsed));
                });
            });

            req.on('error', (error) => {
                reject(new SupabasePersistenceError(`Supabase request failed: ${error.message}`, 'retryable'));
            });

            if (requestBody) req.write(requestBody);
            req.end();
        });
    }

    toPersistenceError(statusCode, parsed) {
        const supabaseCode = parsed && parsed.code;
        const message = parsed && parsed.message ? parsed.message : `Supabase request failed with HTTP ${statusCode}`;
        const conflictTarget = this.getConflictTarget(message);

        if (statusCode === 401 || statusCode === 403) {
            return new SupabasePersistenceError('Supabase authentication failed.', 'configuration', { statusCode, supabaseCode });
        }

        if (statusCode === 409 || supabaseCode === '23505') {
            return new SupabasePersistenceError('Supabase unique constraint conflict.', 'unique_conflict', {
                statusCode,
                supabaseCode,
                conflictTarget
            });
        }

        if (statusCode === 400 || statusCode === 422 || (supabaseCode && supabaseCode.startsWith('23'))) {
            return new SupabasePersistenceError(message, 'validation', { statusCode, supabaseCode });
        }

        if (statusCode >= 500 || statusCode === 408 || statusCode === 429) {
            return new SupabasePersistenceError('Supabase is temporarily unavailable.', 'retryable', { statusCode, supabaseCode });
        }

        return new SupabasePersistenceError(message, 'unknown', { statusCode, supabaseCode });
    }

    getConflictTarget(message) {
        if (!message) return 'unknown';
        if (message.includes('source_message_id')) return 'source_message_id';
        if (message.includes('drive_file_id')) return 'drive_file_id';
        if (message.includes('card_id')) return 'card_id';
        return 'unknown';
    }
}

module.exports = RawContactSupabaseService;
module.exports.SupabasePersistenceError = SupabasePersistenceError;
