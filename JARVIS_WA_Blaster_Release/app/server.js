const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();

// Tambahkan CORS Manual agar bisa diakses dari Web Dashboard
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  if (req.method === 'OPTIONS') {
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH");
    return res.status(200).json({});
  }
  next();
});

app.use(express.json());
app.use(express.static('public'));

const PORT = 3001;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Initialize config if not exists
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ branchName: '', templates: [] }));
}

// WA Client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { 
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions', '--disable-web-security', '--disable-features=IsolateOrigins,site-per-process', '--disable-site-isolation-trials']
  },
  webVersionCache: {
    type: 'none'
  }
});

let qrData = null;
let clientReady = false;

client.on('qr', (qr) => {
  console.log('QR Code received');
  qrcode.toDataURL(qr, (err, url) => {
    qrData = url;
  });
});

async function startClient() {
  try {
    console.log('Initializing WhatsApp Client...');
    await client.initialize();
  } catch (err) {
    console.error('Failed to initialize client, retrying in 5 seconds...', err.message);
    setTimeout(() => {
      client.destroy().catch(() => {});
      startClient();
    }, 5000);
  }
}
startClient();

client.on('ready', () => {
  console.log('WhatsApp Client is ready!');
  clientReady = true;
  qrData = null;
});

client.on('disconnected', (reason) => {
  console.log('Client was logged out', reason);
  clientReady = false;
  qrData = null;
  startClient();
});

// API: Get Status
app.get('/api/status', (req, res) => {
  res.json({ ready: clientReady, qr: qrData });
});

// API: Get Config
app.get('/api/config', (req, res) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  res.json(config);
});

// API: Save Config
app.post('/api/config', (req, res) => {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

// API: Download Result as CSV
app.get('/api/download-result', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="Hasil_Blast_JARVIS.csv"');
  // Use a tab or semicolon, or just comma. For Indonesian Excel, semicolon is safer, or comma.
  let csv = 'Status,Nomor HP,Nama,Keterangan\n';
  blastProgress.logs.forEach(log => {
    // Add apostrophe to phone so Excel treats it as text and doesn't convert to scientific notation
    csv += `"${log.status}","'${log.phone}","${log.name}","${log.reason}"\n`;
  });
  res.send(csv);
});

// Blasting Queue
let blastQueue = [];
let isBlasting = false;
let blastProgress = { total: 0, sent: 0, failed: 0, current: null, logs: [] };

async function processQueue() {
  if (isBlasting || blastQueue.length === 0) return;
  isBlasting = true;
  
  while (blastQueue.length > 0) {
    const job = blastQueue.shift();
    blastProgress.current = `Mengirim ke ${job.phone} (${job.name})...`;
    
    try {
      // Format phone number to standard WA format
      let formattedPhone = job.phone.replace(/\D/g, '');
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '62' + formattedPhone.substring(1);
      }
      const chatId = formattedPhone + '@c.us';
      
      const isRegistered = await client.isRegisteredUser(chatId);
      if (!isRegistered) {
        throw new Error('Nomor tidak terdaftar di WA');
      }
      
      await client.sendMessage(chatId, job.message);
      blastProgress.sent++;
      blastProgress.logs.unshift({ status: 'Sukses', phone: job.phone, name: job.name, reason: '-' });
    } catch (err) {
      blastProgress.failed++;
      blastProgress.logs.unshift({ status: 'Gagal', phone: job.phone, name: job.name, reason: err.message });
    }
    
    // Delay 3-6 seconds
    const delay = Math.floor(Math.random() * 3000) + 3000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  blastProgress.current = 'Selesai';
  isBlasting = false;
}

// API: Start Blast
app.post('/api/blast', (req, res) => {
  if (!clientReady) return res.status(400).json({ error: 'WhatsApp belum terkoneksi' });
  
  const { data, template } = req.body;
  if (!data || data.length === 0) return res.status(400).json({ error: 'Data kosong' });
  
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const branchName = config.branchName || 'Cabang Tidak Diketahui';
  
  blastQueue = [];
  blastProgress = { total: data.length, sent: 0, failed: 0, current: 'Memulai...', logs: [] };
  
  data.forEach(item => {
    let message = template;
    // Replace variables
    message = message.replace(/\[Cabang\]/gi, branchName);
    
    // Auto Gender / Sapaan Logic
    const genderKey = Object.keys(item).find(k => k.toLowerCase().includes('gender') || k.toLowerCase().includes('kelamin') || k.toLowerCase() === 'title');
    let sapaan = 'Bapak/Ibu';
    if (genderKey) {
      const g = item[genderKey].trim().toLowerCase();
      if (g.includes('mr') && !g.includes('mrs')) sapaan = 'Bapak';
      else if (g.includes('mrs')) sapaan = 'Ibu';
      else if (g.includes('miss')) sapaan = 'Kakak';
    }
    message = message.replace(/Bapak\/Ibu/gi, sapaan);
    message = message.replace(/\[Sapaan\]/gi, sapaan);

    Object.keys(item).forEach(key => {
      const regex = new RegExp(`\\[${key}\\]`, 'gi');
      message = message.replace(regex, item[key] || '-');
    });
    
    // Auto-detect Phone and Name columns
    const phoneKey = Object.keys(item).find(k => k.toLowerCase().includes('hp') || k.toLowerCase().includes('phone') || k.toLowerCase().includes('nomor'));
    const nameKey = Object.keys(item).find(k => k.toLowerCase().includes('nama') || k.toLowerCase().includes('name') || k.toLowerCase().includes('customer'));
    
    const phone = phoneKey ? item[phoneKey] : null;
    const name = nameKey ? item[nameKey] : 'Customer';
    
    if (phone) {
      blastQueue.push({ phone, name, message });
    } else {
      blastProgress.total--; // skip invalid row
    }
  });
  
  processQueue(); // Start background processing
  res.json({ success: true, message: 'Blasting dimulai!' });
});

// API: Get Progress
app.get('/api/progress', (req, res) => {
  res.json({
    isBlasting,
    progress: blastProgress
  });
});

app.listen(PORT, () => {
  console.log(`JARVIS WA Blaster berjalan di http://localhost:${PORT}`);
});
