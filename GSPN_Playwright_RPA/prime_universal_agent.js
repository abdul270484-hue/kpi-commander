const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc } = require('firebase/firestore');
const config = require('./config');

const firebaseApp = initializeApp(config.FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);

const CONFIG_FILE = path.join(__dirname, 'ai_config.json');

const PROCESS_MAP = {
    'EMAIL': 'OUTLOOK',
    'OUTLOOK': 'OUTLOOK',
    'SURAT': 'OUTLOOK',
    'CHROME': 'chrome',
    'GOOGLE CHROME': 'chrome',
    'BROWSER': 'chrome',
    'EXCEL': 'EXCEL',
    'MICROSOFT EXCEL': 'EXCEL',
    'WORD': 'WINWORD',
    'MICROSOFT WORD': 'WINWORD',
    'POWERPOINT': 'POWERPNT',
    'PPT': 'POWERPNT',
    'NOTEPAD': 'notepad',
    'CATATAN': 'notepad',
    'WHATSAPP': 'WhatsApp',
    'WA': 'WhatsApp',
    'CALCULATOR': 'calc',
    'KALKULATOR': 'calc',
    'CMD': 'cmd',
    'TERMINAL': 'powershell',
    'EXPLORER': 'explorer',
    'FILE EXPLORER': 'explorer',
    'TASK MANAGER': 'taskmgr',
    'TASKMGR': 'taskmgr',
    'PAINT': 'mspaint'
};

// =====================================================================
// 1. GEMINI TOOL DECLARATIONS (Function Calling Specs)
// =====================================================================
const GEMINI_TOOLS = [
    {
        functionDeclarations: [
            {
                name: "get_executive_briefing",
                description: "Mendapatkan status ringkasan menyeluruh laptop BOS (unread email Outlook, baterai, RAM, sisa harddisk, aplikasi aktif, dan status robot GSPN).",
                parameters: { type: "OBJECT", properties: {} }
            },
            {
                name: "outlook_summarize_email",
                description: "Membaca dan merangkum intisari email Outlook terbaru atau berdasarkan nama pengirim/topik, lengkap dengan poin penting dan action item.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        sender: { type: "STRING", description: "Nama atau sebagian nama pengirim email (opsional)" },
                        query: { type: "STRING", description: "Topik atau kata kunci pencarian email (opsional)" }
                    }
                }
            },
            {
                name: "outlook_reply_email",
                description: "Membalas email resmi langsung dari Outlook di laptop ke pengirim tertentu dengan teks balasan.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        sender: { type: "STRING", description: "Nama pengirim email yang mau dibalas" },
                        replyText: { type: "STRING", description: "Isi teks pesan balasan yang ingin dikirim" }
                    },
                    required: ["sender", "replyText"]
                }
            },
            {
                name: "outlook_read_email_body",
                description: "Membaca isi lengkap pesan/body dari email Outlook.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        sender: { type: "STRING", description: "Nama pengirim" },
                        query: { type: "STRING", description: "Topik/subjek email" }
                    }
                }
            },
            {
                name: "outlook_search_emails",
                description: "Mencari daftar email di Outlook (bisa filter unread, pengirim, atau topik).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        sender: { type: "STRING", description: "Nama pengirim (opsional)" },
                        query: { type: "STRING", description: "Kata kunci topik (opsional)" },
                        onlyUnread: { type: "BOOLEAN", description: "True jika hanya ingin melihat email yang belum dibaca" },
                        limit: { type: "INTEGER", description: "Jumlah email yang ditampilkan (default: 5)" }
                    }
                }
            },
            {
                name: "screen_capture_peek",
                description: "Mengambil tangkapan layar live (screenshot) dari desktop laptop BOS dan mengirimkan gambarnya ke HP.",
                parameters: { type: "OBJECT", properties: {} }
            },
            {
                name: "control_audio_volume",
                description: "Mengatur volume atau mute/unmute audio laptop.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        action: { type: "STRING", enum: ["MUTE", "UP", "DOWN"], description: "Aksi volume: MUTE, UP (besarkan), atau DOWN (kecilkan)" }
                    },
                    required: ["action"]
                }
            },
            {
                name: "manage_windows",
                description: "Meminimalkan semua jendela ke taskbar untuk membersihkan desktop, atau meminimalkan jendela aplikasi tertentu.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        targetApp: { type: "STRING", description: "Nama aplikasi spesifik yang ingin di-minimize (misal: 'CHROME', 'EXCEL'). Kosongkan jika ingin minimize SEMUA jendela." }
                    }
                }
            },
            {
                name: "launch_application_or_web",
                description: "Membuka program di laptop (misal: Excel, Word, Chrome, WhatsApp) atau membuka halaman website di Google Chrome.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        target: { type: "STRING", description: "Nama program atau URL/halaman web yang ingin dibuka" }
                    },
                    required: ["target"]
                }
            },
            {
                name: "get_pc_health_and_battery",
                description: "Mengecek status baterai %, charger, penggunaan RAM %, dan sisa kapasitas penyimpanan Drive C laptop.",
                parameters: { type: "OBJECT", properties: {} }
            },
            {
                name: "lock_workstation",
                description: "Mengunci layar Windows laptop seketika demi keamanan saat BOS meninggalkan meja.",
                parameters: { type: "OBJECT", properties: {} }
            },
            {
                name: "search_local_files",
                description: "Mencari file dokumen atau berkas di laptop BOS (Desktop, Documents, Downloads, KERJAAN).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: { type: "STRING", description: "Nama atau ekstensi file yang dicari" }
                    },
                    required: ["query"]
                }
            },
            {
                name: "read_file_content",
                description: "Membaca teks dari file di laptop.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        fileName: { type: "STRING", description: "Nama file yang ingin dibaca" }
                    },
                    required: ["fileName"]
                }
            },
            {
                name: "take_quick_note",
                description: "Menyimpan catatan atau memo singkat ke file PRIME_NOTES.txt di Desktop laptop BOS.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        noteText: { type: "STRING", description: "Isi teks catatan yang ingin disimpan" }
                    },
                    required: ["noteText"]
                }
            },
            {
                name: "create_desktop_folder",
                description: "Membuat folder baru di Desktop laptop BOS.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        folderName: { type: "STRING", description: "Nama folder yang ingin dibuat" }
                    },
                    required: ["folderName"]
                }
            },
            {
                name: "close_application",
                description: "Menutup program/aplikasi di laptop agar RAM kembali enteng.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        appName: { type: "STRING", description: "Nama aplikasi yang ingin ditutup (misal: Chrome, Excel, Outlook)" }
                    },
                    required: ["appName"]
                }
            },
            {
                name: "trigger_gspn_rpa",
                description: "Memicu penarikan robotik data GSPN Samsung secara langsung dari laptop.",
                parameters: { type: "OBJECT", properties: {} }
            },
            {
                name: "execute_powershell_command",
                description: "Menjalankan perintah PowerShell langsung di laptop untuk tugas-tugas teknis kustom yang tidak tercakup alat lain.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        command: { type: "STRING", description: "Perintah PowerShell yang ingin dieksekusi" }
                    },
                    required: ["command"]
                }
            }
        ]
    }
];

// =====================================================================
// 2. TOOL EXECUTOR REGISTRY (Direct Windows Execution)
// =====================================================================
let lastExecutionDetail = null;

async function executeTool(name, args = {}, lockManager, executeRpaCycle) {
    console.log(`   [TOOL CALL] ⚙️ Mengeksekusi: ${name}(${JSON.stringify(args)})`);
    lastExecutionDetail = null;

    try {
        switch (name) {
            case 'get_executive_briefing': {
                let unread = 0, topMails = [];
                try {
                    const psMail = path.join(__dirname, 'read_outlook.ps1');
                    const rawMail = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psMail}" -Action RECENT -Limit 3`, { encoding: 'utf8' }).trim();
                    const mData = JSON.parse(rawMail);
                    if (mData.status === 'OK') { unread = mData.unread || 0; topMails = mData.emails || []; }
                } catch (_) {}

                let health = { battery: 100, charging: true, ramPercent: 0, freeDiskGB: 0, activeApps: [] };
                try {
                    const psHealth = path.join(__dirname, 'read_pc_health.ps1');
                    const rawHealth = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psHealth}"`, { encoding: 'utf8' }).trim();
                    const hData = JSON.parse(rawHealth);
                    if (hData.status === 'OK') health = hData;
                } catch (_) {}

                lastExecutionDetail = {
                    type: 'EXECUTIVE_BRIEFING',
                    unread, topMails, ...health,
                    rpaStatus: (lockManager && lockManager.currentExecutionId) ? 'RUNNING' : 'STANDBY'
                };
                return {
                    success: true,
                    outlookUnread: unread,
                    recentEmails: topMails.map(m => `${m.sender}: "${m.subject}" (${m.time})`),
                    batteryPercent: health.battery,
                    isCharging: health.charging,
                    ramUsagePercent: health.ramPercent,
                    freeDiskC_GB: health.freeDiskGB,
                    activeApps: health.activeApps,
                    rpaStatus: (lockManager && lockManager.currentExecutionId) ? 'RUNNING' : 'STANDBY'
                };
            }

            case 'outlook_summarize_email': {
                const psMail = path.join(__dirname, 'summarize_email.ps1');
                const sender = args.sender || '';
                const query = args.query || '';
                const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psMail}" -Sender "${sender}" -Query "${query}"`;
                const raw = execSync(cmd, { encoding: 'utf8' }).trim();
                const res = JSON.parse(raw);
                if (res.status === 'OK') {
                    lastExecutionDetail = { type: 'EMAIL_SUMMARY', ...res };
                    return { success: true, ...res };
                }
                return { success: false, message: 'Email tidak ditemukan.' };
            }

            case 'outlook_reply_email': {
                const psReply = path.join(__dirname, 'reply_outlook.ps1');
                const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psReply}" -Sender "${args.sender}" -ReplyText "${(args.replyText || '').replace(/"/g, '`"')}" -SendNow`;
                const raw = execSync(cmd, { encoding: 'utf8' }).trim();
                const res = JSON.parse(raw);
                if (res.status === 'OK') {
                    lastExecutionDetail = { type: 'EMAIL_REPLY', ...res };
                    return { success: true, ...res };
                }
                return { success: false, message: res.message || 'Gagal mengirim balasan.' };
            }

            case 'outlook_read_email_body': {
                const psMail = path.join(__dirname, 'read_outlook.ps1');
                const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psMail}" -Action READ_BODY -Sender "${args.sender || ''}" -Query "${args.query || ''}"`;
                const raw = execSync(cmd, { encoding: 'utf8' }).trim();
                const res = JSON.parse(raw);
                if (res.status === 'OK') {
                    lastExecutionDetail = { type: 'EMAIL_DETAIL', ...res };
                    return { success: true, ...res };
                }
                return { success: false, message: 'Email tidak ditemukan.' };
            }

            case 'outlook_search_emails': {
                const psMail = path.join(__dirname, 'read_outlook.ps1');
                const action = (args.sender || args.query) ? 'SEARCH' : 'RECENT';
                const unreadFlag = args.onlyUnread ? '-OnlyUnread' : '';
                const limit = args.limit || 5;
                const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psMail}" -Action ${action} -Sender "${args.sender || ''}" -Query "${args.query || ''}" ${unreadFlag} -Limit ${limit}`;
                const raw = execSync(cmd, { encoding: 'utf8' }).trim();
                const outData = JSON.parse(raw);
                if (outData.status === 'OK') {
                    lastExecutionDetail = { type: 'OUTLOOK_EMAILS', unread: outData.unread, emails: outData.emails };
                    return { success: true, ...outData };
                }
                return { success: false, message: 'Outlook belum siap atau tidak aktif.' };
            }

            case 'screen_capture_peek': {
                const psScreen = path.join(__dirname, 'take_screenshot.ps1');
                const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psScreen}"`, { encoding: 'utf8' }).trim();
                const sData = JSON.parse(raw);
                if (sData.status === 'OK' && sData.base64) {
                    lastExecutionDetail = { type: 'SCREEN_CAPTURE', image: sData.base64, capturedAt: new Date().toLocaleTimeString('id-ID') };
                    return { success: true, captured: true };
                }
                return { success: false, message: 'Layar laptop saat ini sedang terkunci atau sleep.' };
            }

            case 'control_audio_volume': {
                if (args.action === 'MUTE') {
                    execSync(`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"`);
                    return { success: true, status: 'Audio Mute/Unmute toggle activated' };
                } else if (args.action === 'UP') {
                    execSync(`powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; 1..5 | ForEach-Object { $w.SendKeys([char]175) }"`);
                    return { success: true, status: 'Volume dinaikkan' };
                } else {
                    execSync(`powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; 1..5 | ForEach-Object { $w.SendKeys([char]174) }"`);
                    return { success: true, status: 'Volume dikecilkan' };
                }
            }

            case 'manage_windows': {
                const target = (args.targetApp || '').trim().toUpperCase();
                const proc = PROCESS_MAP[target] || null;
                if (proc) {
                    const psMin = `$w = New-Object -ComObject WScript.Shell; if ($w.AppActivate('${proc}')) { Start-Sleep -Milliseconds 150; $w.SendKeys('% n'); 'MINIMIZED' } else { (New-Object -ComObject Shell.Application).MinimizeAll(); 'ALL' }`;
                    execSync(`powershell -NoProfile -Command "${psMin}"`);
                    return { success: true, action: `Jendela ${target} diminimalkan ke taskbar` };
                } else {
                    execSync(`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).MinimizeAll()"`);
                    return { success: true, action: 'Semua jendela diminimalkan ke taskbar' };
                }
            }

            case 'launch_application_or_web': {
                const target = (args.target || '').trim();
                const mappedApp = PROCESS_MAP[target.toUpperCase()];
                if (mappedApp) {
                    exec(`start ${mappedApp}`);
                    return { success: true, launchedApp: mappedApp };
                } else {
                    const psBrowser = path.join(__dirname, 'smart_browser.ps1');
                    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psBrowser}" -Target "${target.replace(/"/g, '`"')}"`;
                    const raw = execSync(cmd, { encoding: 'utf8' }).trim();
                    const bRes = JSON.parse(raw);
                    if (bRes.status === 'OK') {
                        lastExecutionDetail = { type: 'BROWSER_ACTION', title: bRes.title, url: bRes.url, target: bRes.target, image: bRes.screenshot || null };
                        return { success: true, ...bRes };
                    }
                    return { success: true, opened: target };
                }
            }

            case 'get_pc_health_and_battery': {
                const psFile = path.join(__dirname, 'read_pc_health.ps1');
                const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { encoding: 'utf8' }).trim();
                const hData = JSON.parse(raw);
                if (hData.status === 'OK') {
                    lastExecutionDetail = { type: 'PC_HEALTH', ...hData };
                    return { success: true, ...hData };
                }
                return { success: false, message: 'Gagal membaca sensor hardware.' };
            }

            case 'lock_workstation': {
                exec('rundll32.exe user32.dll,LockWorkStation');
                return { success: true, status: 'Workstation locked' };
            }

            case 'search_local_files': {
                const psFile = path.join(__dirname, 'find_files.ps1');
                const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}" -Query "${args.query}" -Limit 5`, { encoding: 'utf8' }).trim();
                const fData = JSON.parse(raw);
                if (fData.status === 'OK') {
                    lastExecutionDetail = { type: 'FILE_LIST', files: fData.files };
                    return { success: true, files: fData.files };
                }
                return { success: false, message: 'File tidak ditemukan.' };
            }

            case 'read_file_content': {
                const psCmd = `$f = Get-ChildItem -Path @($env:USERPROFILE + '\\Desktop', $env:USERPROFILE + '\\Downloads', $env:USERPROFILE + '\\Documents', 'C:\\Users\\unicom\\KERJAAN') -Recurse -Depth 2 -Filter "*${args.fileName}*" -ErrorAction SilentlyContinue | Select-Object -First 1; if ($f) { Get-Content $f.FullName -TotalCount 30 -Raw } else { "NOT_FOUND" }`;
                const raw = execSync(`powershell -NoProfile -Command "${psCmd}"`, { encoding: 'utf8' }).trim();
                if (raw && raw !== 'NOT_FOUND') {
                    return { success: true, content: raw.substring(0, 800) };
                }
                return { success: false, message: 'File tidak ditemukan.' };
            }

            case 'take_quick_note': {
                const desktopPath = path.join(process.env.USERPROFILE, 'Desktop', 'PRIME_NOTES.txt');
                const timestamp = new Date().toLocaleString('id-ID');
                fs.appendFileSync(desktopPath, `\n[${timestamp}] ${args.noteText}\n`, 'utf8');
                return { success: true, savedNote: args.noteText };
            }

            case 'create_desktop_folder': {
                const targetPath = path.join(process.env.USERPROFILE, 'Desktop', args.folderName);
                if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
                return { success: true, createdPath: targetPath };
            }

            case 'close_application': {
                const raw = (args.appName || '').trim().toUpperCase();
                const proc = PROCESS_MAP[raw] || raw;
                exec(`taskkill /IM "${proc}.exe" /F`);
                return { success: true, closedProcess: proc };
            }

            case 'trigger_gspn_rpa': {
                if (lockManager && !lockManager.currentExecutionId && executeRpaCycle) {
                    executeRpaCycle('PRIME_AUTONOMOUS_COMMANDER');
                    return { success: true, message: 'Siklus RPA GSPN berhasil dipicu.' };
                }
                return { success: false, message: 'RPA sedang berjalan, tunggu hingga selesai.' };
            }

            case 'execute_powershell_command': {
                const psOut = execSync(`powershell -NoProfile -Command "${(args.command || '').replace(/"/g, '`"')}"`, { encoding: 'utf8' }).trim();
                return { success: true, output: psOut || '(Command completed without output)' };
            }

            default:
                return { success: false, message: `Tool ${name} tidak dikenali.` };
        }
    } catch (err) {
        console.error(`   [TOOL ERROR] ${name}:`, err.message);
        return { success: false, error: err.message };
    }
}

// =====================================================================
// 3. GEMINI AI AUTONOMOUS BRAIN (Function Calling Agent)
// =====================================================================
async function getGeminiApiKey() {
    // 1. Cek ENV lokal
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
        return process.env.GEMINI_API_KEY.trim();
    }
    // 2. Cek file konfigurasi lokal
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (cfg.geminiApiKey && cfg.geminiApiKey.trim()) return cfg.geminiApiKey.trim();
        } catch (_) {}
    }
    // 3. Cek Firestore system_config/ai
    try {
        const snap = await getDoc(doc(db, 'system_config', 'ai'));
        if (snap.exists() && snap.data().geminiApiKey) {
            return snap.data().geminiApiKey.trim();
        }
    } catch (_) {}
    return null;
}

async function runGeminiAutonomousAgent(instruction, userEmail, lockManager, executeRpaCycle) {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) return null; // Fallback ke Heuristic Engine jika belum ada API key

    const systemPrompt = `Kamu adalah PRIME, asisten AI pribadi super pintar sekaligus Chief of Staff untuk BOS (Pak Abdul, Area Service Manager).
Karaktermu:
- Sangat loyal, cerdas, berwibawa namun luwes & santai. Selalu menyapa pengguna dengan sebutan "BOS".
- Menggunakan Bahasa Indonesia yang alami, luwes, dan solutif layaknya partner kerja eksekutif andalan.
- Kamu memiliki kontrol otonom penuh terhadap laptop Windows BOS melalui kumpulan fungsi (tools) yang tersedia:
  * Outlook (baca, rangkum, cari, balas email langsung tanpa login ulang)
  * Kontrol hardware (cek baterai %, RAM, harddisk, intip layar laptop live)
  * Kontrol sistem (minimize jendela, kunci workstation, buka aplikasi, bersihkan sampah, kelola volume)
  * File laptop (cari file, baca file, buat folder, catat memo)
  * Robotik GSPN Samsung (memicu penarikan data)
  * PowerShell (menjalankan perintah shell bebas untuk hal-hal kustom)

Aturan Kerja:
1. Jika permintaan BOS memerlukan tindakan di laptop, panggil tool yang sesuai.
2. Setelah tool selesai, jelaskan hasilnya kepada BOS secara ringkas, percaya diri, dan berikan tindak lanjut proaktif.
3. Jika permintaan berupa pertanyaan umum, saran manajerial, draft email, atau obrolan santai, jawablah secara langsung dengan wawasan yang sangat cerdas, terstruktur, dan elegan.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const conversationContents = [
        {
            role: "user",
            parts: [{ text: instruction }]
        }
    ];

    try {
        console.log('   [GEMINI AGENT] 🧠 Mengirim prompt ke Gemini AI Brain...');
        const payload = {
            contents: conversationContents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: GEMINI_TOOLS,
            generationConfig: {
                temperature: 0.35,
                maxOutputTokens: 1000
            }
        };

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errTxt = await res.text();
            console.warn(`   [GEMINI API WARNING] Status ${res.status}: ${errTxt.substring(0, 100)}`);
            return null; // Fallback
        }

        const data = await res.json();
        const candidate = data.candidates && data.candidates[0];
        if (!candidate || !candidate.content) return null;

        const part = candidate.content.parts && candidate.content.parts[0];
        if (!part) return null;

        // JIKA GEMINI MEMUTUSKAN MEMANGGIL TOOL (Function Calling)
        if (part.functionCall) {
            const fnName = part.functionCall.name;
            const fnArgs = part.functionCall.args || {};
            console.log(`   [GEMINI AGENT] 🎯 Gemini menginstruksikan tool: "${fnName}"`);

            const toolResult = await executeTool(fnName, fnArgs, lockManager, executeRpaCycle);

            // Kirim hasil tool kembali ke Gemini untuk sintesis respon akhir
            conversationContents.push(candidate.content);
            conversationContents.push({
                role: "function",
                parts: [{
                    functionResponse: {
                        name: fnName,
                        response: toolResult
                    }
                }]
            });

            const followUpRes = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: conversationContents,
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    tools: GEMINI_TOOLS
                })
            });

            if (followUpRes.ok) {
                const followData = await followUpRes.json();
                const followPart = followData.candidates?.[0]?.content?.parts?.[0];
                if (followPart && followPart.text) {
                    return {
                        feedback: followPart.text.trim(),
                        detail: lastExecutionDetail
                    };
                }
            }

            return {
                feedback: `Siap Bos! Tugas "${fnName}" sudah berhasil dieksekusi di laptop BOS.`,
                detail: lastExecutionDetail
            };
        }

        // JIKA GEMINI MERESPON TEKS LANGSUNG (Chit-chat / Analisis / Jawaban Cerdas)
        if (part.text) {
            return {
                feedback: part.text.trim(),
                detail: null
            };
        }

    } catch (e) {
        console.warn('   [GEMINI AGENT ERROR]', e.message);
    }

    return null;
}

// =====================================================================
// 4. AUTONOMOUS HEURISTIC BRAIN (Zero-Downtime Fallback)
// =====================================================================
async function runHeuristicFallback(instruction, userEmail, lockManager, executeRpaCycle) {
    const rawInput = (instruction || '').trim();
    if (!rawInput) {
        return { feedback: 'Siap Bos! Ada yang bisa gue bantu di laptop sekarang?', detail: null };
    }

    const cleanText = rawInput
        .replace(/^(?:eh|bro|min|prime|tolong|tolong dong|coba|coba dong|bisa ga|bisa tolong|coba bantuin|bantuin dong|bisa bukain|bisa cekin|kira-kira|ntar tolong|yuk|tolongin)\s+/gi, '')
        .trim();
    const text = cleanText || rawInput;
    const upper = text.toUpperCase();

    // 0. Chit-chat & Sapaan
    if (
        upper === 'HALO' || upper === 'HAI' || upper === 'HI' || upper === 'PAGI' || upper === 'SIANG' || upper === 'SORE' || upper === 'MALAM' ||
        upper.includes('APA KABAR') || upper.includes('LAGI APA') || upper.includes('LAGI NGAPAIN') ||
        upper.includes('SIAPA LU') || upper.includes('SIAPA KAMU') || upper.includes('SIAPA ANDA') ||
        upper.includes('MAKASIH') || upper.includes('TERIMA KASIH') || upper.includes('KEREN LU') || upper.includes('MANTAP')
    ) {
        if (upper.includes('MAKASIH') || upper.includes('TERIMA KASIH') || upper.includes('MANTAP') || upper.includes('KEREN')) {
            return { feedback: 'Sama-sama, Bos! Siap selalu buat bantu segala urusan operasional BOS di laptop ini. Ada lagi yang mau gue beresin?', detail: null };
        } else if (upper.includes('SIAPA LU') || upper.includes('SIAPA KAMU')) {
            return { feedback: 'Gue PRIME, Bos! Asisten pribadi sekaligus Chief of Staff otonom BOS di laptop ini. Gue bisa baca & balas email Outlook, intip layar laptop, beresin jendela, cek hardware, sampai memicu robot GSPN.', detail: null };
        } else if (upper.includes('LAGI APA') || upper.includes('LAGI NGAPAIN') || upper.includes('APA KABAR')) {
            return { feedback: 'Kabar baik dan selalu fit, Bos! Gue lagi standby memantau laptop BOS. Robotik GSPN dan Outlook siap dipicu kapan aja BOS perintahkan. Mau tugasin gue apa nih sekarang?', detail: null };
        } else {
            return { feedback: 'Halo Bos! PRIME siap sedia. Mau gue bantu apa hari ini? Tinggal ngomong santai aja, Bos!', detail: null };
        }
    }

    // 1. Executive Briefing
    if (upper.includes('BRIEFING') || upper.includes('LAPORAN STATUS') || upper.includes('UPDATE OPERASIONAL') || upper.includes('KONDISI KERJA') || upper.includes('OVERVIEW') || upper.includes('SITUASI')) {
        const res = await executeTool('get_executive_briefing', {}, lockManager, executeRpaCycle);
        let briefingText = `Siap Bos! Ini rangkuman operasional laptop BOS saat ini:\n\n`;
        briefingText += `📧 Outlook: Ada ${res.outlookUnread || 0} email unread.`;
        if (res.recentEmails && res.recentEmails.length > 0) {
            briefingText += ` Paling baru: ${res.recentEmails[0]}.`;
        }
        briefingText += `\n🔋 Baterai: ${res.batteryPercent}% (${res.isCharging ? 'posisi lagi dicolok charger' : 'pakai baterai'}), RAM kepake ${res.ramUsagePercent}%, Drive C sisa ${res.freeDiskC_GB} GB.`;
        if (res.activeApps && res.activeApps.length > 0) {
            briefingText += `\n💻 Aplikasi aktif: ${res.activeApps.join(', ')}.`;
        }
        briefingText += `\n⚡ Robotik GSPN: ${res.rpaStatus === 'RUNNING' ? 'Lagi aktif tarik data' : 'Standby siap jalan'}.`;
        briefingText += `\n\nAda tugas yang mau langsung gue eksekusi, Bos?`;
        return { feedback: briefingText, detail: lastExecutionDetail };
    }

    // 2. Outlook: Rangkum Email
    if (upper.includes('RANGKUM') || upper.includes('RINGKAS') || upper.includes('SUMMARY') || upper.includes('POIN EMAIL') || upper.includes('INTI EMAIL') || upper.includes('KESIMPULAN')) {
        let sender = '', query = '';
        const dariMatch = text.match(/(?:dari|pengirim|sender)\s+([a-zA-Z0-9_\s]+?)(?:\s*(?:tentang|mengenai|perihal|soal|$))/i);
        if (dariMatch && dariMatch[1]) sender = dariMatch[1].trim();
        const tentangMatch = text.match(/(?:tentang|mengenai|perihal|soal)\s+([a-zA-Z0-9_\s]+)/i);
        if (tentangMatch && tentangMatch[1]) query = tentangMatch[1].trim();

        const res = await executeTool('outlook_summarize_email', { sender, query }, lockManager, executeRpaCycle);
        if (res.success) {
            const points = (res.keyPoints || []).map(p => `• ${p}`).join('\n');
            let actText = (res.actionItems && res.actionItems.length > 0) ? `\n\n⚡ Tindakan yang diminta:\n` + res.actionItems.map(a => `• ${a}`).join('\n') : '';
            return {
                feedback: `Ini intinya Bos, email dari ${res.sender} [${res.time}] soal "${res.subject}":\n\n${points}${actText}\n\nKartu detailnya udah gue pasang di bawah ya, Bos. Mau sekalian gue bantu balas?`,
                detail: lastExecutionDetail
            };
        }
        return { feedback: `Gue udah cari di Outlook tapi belum nemu email dari "${sender || 'terbaru'}" untuk dirangkum, Bos.`, detail: null };
    }

    // 3. Outlook: Balas Email
    if (upper.startsWith('BALAS') || upper.startsWith('BALES') || upper.includes('BALAS EMAIL') || upper.includes('BALESIN') || upper.startsWith('REPLY') || upper.includes('REPLY EMAIL') || upper.startsWith('JAWAB')) {
        let sender = '', replyMsg = '';
        const dariMatch = text.match(/(?:dari|ke)\s+([a-zA-Z0-9_\s]+?)(?:\s*(?::|bilang|isi|pesan)\s*)/i);
        if (dariMatch && dariMatch[1]) {
            sender = dariMatch[1].trim();
            replyMsg = text.substring(dariMatch.index + dariMatch[0].length).trim();
        } else {
            const msgMatch = text.match(/(?::|bilang)\s*(.+)/i);
            if (msgMatch && msgMatch[1]) replyMsg = msgMatch[1].trim();
            const sMatch = text.match(/email\s+([a-zA-Z0-9_\s]+)/i);
            if (sMatch && sMatch[1]) sender = sMatch[1].trim();
        }

        if (!sender || !replyMsg) {
            return { feedback: 'Sebutkan email siapa dan apa pesannya ya Bos. Contoh: "Balas email dari Ani: Siap Bu, part sudah diterima."', detail: null };
        }
        const res = await executeTool('outlook_reply_email', { sender, replyText: replyMsg }, lockManager, executeRpaCycle);
        if (res.success) {
            return {
                feedback: `Beres Bos! Balasan resmi udah langsung gue kirim ke ${res.to} via Outlook laptop:\n\nSubjek: "${res.subject}"\nPesan: "${res.sentText}"\n\nAda email lain yang mau dibalas sekalian?`,
                detail: lastExecutionDetail
            };
        }
        return { feedback: `Waduh, belum berhasil kirim balasan ke ${sender}, Bos. Penyebab: ${res.message || 'Email tidak ditemukan'}`, detail: null };
    }

    // 4. Outlook: Baca Lengkap
    if ((upper.includes('BACA') && (upper.includes('EMAIL') || upper.includes('SURAT') || upper.includes('PESAN'))) || upper.includes('ISI EMAIL') || upper.includes('DETAIL EMAIL')) {
        let sender = '', query = '';
        const dariMatch = text.match(/dari\s+([a-zA-Z0-9_\s]+)/i);
        if (dariMatch && dariMatch[1]) sender = dariMatch[1].trim();
        const tentangMatch = text.match(/(?:tentang|mengenai|perihal)\s+([a-zA-Z0-9_\s]+)/i);
        if (tentangMatch && tentangMatch[1]) query = tentangMatch[1].trim();

        const res = await executeTool('outlook_read_email_body', { sender, query }, lockManager, executeRpaCycle);
        if (res.success) {
            return {
                feedback: `Ini isi lengkap email dari ${res.sender} [${res.time}] perihal "${res.subject}", Bos:\n\n${res.body}`,
                detail: lastExecutionDetail
            };
        }
        return { feedback: `Gue belum nemu email yang cocok dari "${sender || 'pengirim tersebut'}", Bos.`, detail: null };
    }

    // 5. Outlook: Search & Recent
    if (upper.includes('EMAIL') || upper.includes('OUTLOOK') || upper.includes('INBOX') || upper.includes('SURAT') || upper.includes('CEK PESAN') || upper === 'CHECK_OUTLOOK') {
        const onlyUnread = upper.includes('UNREAD') || upper.includes('BELUM DIBACA') || upper.includes('BELUM BACA');
        let sender = '', query = '';
        const dariMatch = text.match(/(?:dari|pengirim|sender)\s+([a-zA-Z0-9_\s]+?)(?:\s*(?:tentang|mengenai|perihal|soal|subject|subjek|$))/i);
        if (dariMatch && dariMatch[1]) sender = dariMatch[1].trim();
        const topicMatch = text.match(/(?:tentang|mengenai|perihal|soal|subjek|subject)\s+([a-zA-Z0-9_\s]+)/i);
        if (topicMatch && topicMatch[1]) query = topicMatch[1].trim();

        const res = await executeTool('outlook_search_emails', { sender, query, onlyUnread, limit: 6 }, lockManager, executeRpaCycle);
        if (res.success && res.emails && res.emails.length > 0) {
            const top = res.emails[0];
            return {
                feedback: `Dapet nih Bos! Ditemukan ${res.emails.length} email di Outlook (${res.unread || 0} unread). Paling baru dari ${top.sender}: "${top.subject}". Mau gue rangkum isinya?`,
                detail: lastExecutionDetail
            };
        }
        return { feedback: `Gue udah cari di Outlook, tapi belum nemu email yang cocok sama kriteria itu, Bos.`, detail: null };
    }

    // 6. Screenshot / Intip Layar
    if (upper.includes('SCREENSHOT') || upper.includes('SCREENSHOOT') || upper.includes('TANGKAPAN LAYAR') || upper.includes('INTIP') || (upper.includes('LIHAT') && (upper.includes('LAPTOP') || upper.includes('LAYAR'))) || upper.includes('PEEK')) {
        const res = await executeTool('screen_capture_peek', {}, lockManager, executeRpaCycle);
        if (res.success) {
            return { feedback: 'Ini Bos, tangkapan layar live laptop BOS saat ini. Kartu gambarnya udah gue pasang di bawah ya!', detail: lastExecutionDetail };
        }
        return { feedback: 'Layar laptop saat ini sepertinya lagi terkunci (Lock Screen) atau sleep, Bos.', detail: null };
    }

    // 7. Volume
    if (upper.includes('VOLUME') || upper.includes('MUTE') || upper.includes('SUARA')) {
        const act = (upper.includes('MUTE') || upper.includes('HENING') || upper.includes('SENYAP')) ? 'MUTE' : ((upper.includes('BESARKAN') || upper.includes('NAIKKAN') || upper.includes('UP') || upper.includes('GEDEIN')) ? 'UP' : 'DOWN');
        await executeTool('control_audio_volume', { action: act }, lockManager, executeRpaCycle);
        return { feedback: `Siap Bos! Pengaturan audio laptop (${act}) udah langsung gue terapkan.`, detail: null };
    }

    // 8. Minimize Windows
    if (upper.includes('MINIMIZE') || upper.includes('MINIMISE') || upper.includes('RAPI') || upper.includes('BERANTAKAN') || upper.includes('BERSIHIN LAYAR') || upper.includes('TAMPILKAN DESKTOP') || upper.includes('KECILKAN JENDELA')) {
        const rawTarget = text.replace(/minimize|minimise|rapihin|rapiin|berantakan|bersihin layar|tampilkan desktop|lihat desktop|kecilkan jendela|layar|laptop|dong|bro|jendela|semua/gi, '').trim();
        await executeTool('manage_windows', { targetApp: rawTarget }, lockManager, executeRpaCycle);
        return { feedback: 'Siap Bos! Layar desktop laptop BOS udah gue bersihkan dan rapikan ke taskbar.', detail: null };
    }

    // 9. Buka Aplikasi / Web
    if (upper.startsWith('KLIK') || upper.startsWith('CLICK') || upper.startsWith('BUKA') || upper.startsWith('BUKAIN') || upper.startsWith('OPEN') || upper.startsWith('JALANKAN') || upper.startsWith('PILIH')) {
        const rawTarget = text.replace(/klik|click|bukain|buka|open|jalankan|pilih|di laptop|di chrome|aplikasi/gi, '').trim();
        if (rawTarget) {
            const res = await executeTool('launch_application_or_web', { target: rawTarget }, lockManager, executeRpaCycle);
            return { feedback: `Siap Bos! "${rawTarget}" udah langsung gue buka di laptop BOS.`, detail: lastExecutionDetail };
        }
        return { feedback: 'Sebutkan apa yang mau dibuka ya Bos, contoh: "Buka Excel" atau "Buka YouTube".', detail: null };
    }

    // 10. Hardware & Baterai
    if (upper.includes('BATERAI') || upper.includes('BATTERY') || upper.includes('RAM') || upper.includes('SPEK') || upper.includes('KONDISI') || upper.includes('HARDWARE') || upper.includes('STORAGE') || upper.includes('DISK') || upper.includes('CHARGER') || upper.includes('CAS')) {
        const res = await executeTool('get_pc_health_and_battery', {}, lockManager, executeRpaCycle);
        if (res.success) {
            return {
                feedback: `Kondisi hardware laptop mantap, Bos! Baterai ${res.battery}% (${res.charging ? 'lagi dicolok charger' : 'pakai baterai'}), RAM kepake cuma ${res.ramPercent}%, dan Drive C masih lega ${res.freeDiskGB} GB. Siap diajak kerja berat!`,
                detail: lastExecutionDetail
            };
        }
        return { feedback: 'Kondisi hardware laptop semuanya normal dan siap tempur, Bos.', detail: null };
    }

    // 11. Kunci Layar
    if (upper.includes('KUNCI') || upper.includes('LOCK')) {
        await executeTool('lock_workstation', {}, lockManager, executeRpaCycle);
        return { feedback: 'Protokol keamanan aktif. Layar laptop BOS udah langsung gue kunci seketika ya!', detail: null };
    }

    // 12. Cari File
    if (upper.includes('CARI FILE') || upper.includes('TEMUKAN FILE') || upper.includes('SEARCH FILE')) {
        const queryMatch = text.match(/(?:file|dokumen)\s+([a-zA-Z0-9_\-\.\s]+)/i);
        const query = queryMatch ? queryMatch[1].trim() : '';
        if (query) {
            const res = await executeTool('search_local_files', { query }, lockManager, executeRpaCycle);
            if (res.success && res.files && res.files.length > 0) {
                return { feedback: `Dapet nih Bos! Ditemukan ${res.files.length} file terkait "${query}" di folder laptop.`, detail: lastExecutionDetail };
            }
            return { feedback: `Gue belum nemu file bernama "${query}" di folder kerja laptop, Bos.`, detail: null };
        }
        return { feedback: 'Sebutkan nama file yang mau dicari ya Bos, contoh: "Cari file laporan"', detail: null };
    }

    // 13. Tarik GSPN
    if (upper.includes('TARIK GSPN') || upper.includes('SYNC GSPN') || upper.includes('SCRAPE GSPN') || upper.includes('DATA GSPN') || upper.includes('JALANKAN RPA')) {
        const res = await executeTool('trigger_gspn_rpa', {}, lockManager, executeRpaCycle);
        return { feedback: res.message || 'Perintah GSPN diproses, Bos.', detail: null };
    }

    // 14. PowerShell Direct
    if (upper.startsWith('POWERSHELL') || upper.startsWith('CMD') || upper.startsWith('RUN:')) {
        const rawScript = text.replace(/^(?:powershell|cmd|run):\s*/i, '').trim();
        const res = await executeTool('execute_powershell_command', { command: rawScript }, lockManager, executeRpaCycle);
        return { feedback: `Hasil eksekusinya di laptop, Bos:\n\n${res.output}`, detail: null };
    }

    // 15. Default Natural Response
    return {
        feedback: `Siap Bos! Gue dengar instruksi BOS: "${rawInput}". Ada detail tambahan atau ada tindakan tertentu di laptop yang mau langsung gue eksekusi?`,
        detail: null
    };
}

// =====================================================================
// 5. UNIVERSAL TASK ROUTER (Gemini First -> Heuristic Fallback)
// =====================================================================
async function runUniversalTask(instruction, userEmail, lockManager, executeRpaCycle) {
    console.log(`\n=============================================================`);
    console.log(`  🤖 [PRIME SUPER ASISTEN] Perintah Diterima: "${instruction}"`);
    console.log(`  Pengirim: ${userEmail}`);
    console.log(`=============================================================`);

    // 1. Coba eksekusi dengan Gemini AI Brain (Full Autonomous LLM)
    try {
        const geminiResult = await runGeminiAutonomousAgent(instruction, userEmail, lockManager, executeRpaCycle);
        if (geminiResult && geminiResult.feedback) {
            console.log(`   [SUCCESS] Dilayani oleh Gemini AI Autonomous Brain ✅`);
            return geminiResult;
        }
    } catch (err) {
        console.warn('   [GEMINI FALLBACK TRIGGERED]', err.message);
    }

    // 2. Jika Gemini belum ada API key atau offline, layani dengan Autonomous Heuristic Brain
    console.log(`   [FALLBACK] Dilayani oleh Autonomous Heuristic Brain ⚡`);
    const fallbackResult = await runHeuristicFallback(instruction, userEmail, lockManager, executeRpaCycle);
    return fallbackResult;
}

module.exports = {
    runUniversalTask,
    executeTool
};
