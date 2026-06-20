const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Add Log Kunjungan button
html = html.replace(
    /<button id="btn-manage-users".*?<\/button>/,
    `$&
                    <button id="btn-access-logs" style="background: rgba(16, 185, 129, 0.2); color: var(--accent-green); border: 1px solid var(--accent-green); padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: 600; display: none;"><i class="fa-solid fa-list-check"></i> Log Kunjungan</button>`
);

// 2. Add Logs Modal at the bottom before closing body
const logsModal = `
    <!-- Access Logs Modal -->
    <div id="logs-modal" class="modal hidden">
        <div class="modal-content" style="max-width: 700px; padding: 30px;">
            <span class="close-modal" id="close-logs-modal">&times;</span>
            <h2 style="margin-bottom: 5px; color: var(--accent-green);"><i class="fa-solid fa-list-check"></i> Log Kunjungan Aktif</h2>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px;">Riwayat login pengguna terbaru untuk memantau keamanan sistem.</p>
            
            <div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border-glass); border-radius: 8px; background: rgba(0,0,0,0.2);">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: rgba(255,255,255,0.05); text-align: left; position: sticky; top: 0; z-index: 10;">
                        <tr>
                            <th style="padding: 12px; font-size: 0.8rem; color: var(--text-muted);">Pengguna</th>
                            <th style="padding: 12px; font-size: 0.8rem; color: var(--text-muted);">Waktu Akses</th>
                            <th style="padding: 12px; font-size: 0.8rem; color: var(--text-muted);">Perangkat</th>
                        </tr>
                    </thead>
                    <tbody id="access-logs-list">
                        <!-- Logs injected here -->
                    </tbody>
                </table>
            </div>
        </div>
    </div>
`;

if (!html.includes('id="logs-modal"')) {
    html = html.replace('</body>', logsModal + '\n</body>');
}

fs.writeFileSync('index.html', html);
console.log('index.html updated with Logs Modal and Button!');
