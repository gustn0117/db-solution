const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const DATA_FILE = '/data/inquiries.json';
const PASSWORD = '1234';

// Generate a random token on startup
const AUTH_TOKEN = crypto.randomBytes(32).toString('hex');
const tokens = new Set();

app.use(express.json());

// Serve static files, but block sensitive files
app.use((req, res, next) => {
  const blocked = ['/server.js', '/package.json', '/package-lock.json', '/node_modules', '/data', '/Dockerfile', '/docker-compose.yml', '/nginx.conf', '/.git', '/.dockerignore'];
  const lower = req.path.toLowerCase();
  for (const b of blocked) {
    if (lower === b || lower.startsWith(b + '/')) {
      return res.status(404).send('Not found');
    }
  }
  next();
});

// Decode Korean URL paths and try .html extension
app.use((req, res, next) => {
  const decoded = decodeURIComponent(req.path);
  if (decoded !== req.path) {
    const filePath = path.join(__dirname, decoded);
    // Try with .html extension first (handles 채용정보.html vs 채용정보/ folder)
    const htmlPath = filePath + '.html';
    if (fs.existsSync(htmlPath)) {
      return res.sendFile(htmlPath);
    }
    // Try exact file (not directory)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }
  }
  next();
});

app.use(express.static(path.join(__dirname), {
  index: 'index.html'
}));

// Fallback: try .html extension for non-encoded paths
app.use((req, res, next) => {
  const filePath = path.join(__dirname, req.path + '.html');
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  next();
});

// Helper: read inquiries
function readInquiries() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading inquiries:', e.message);
  }
  return [];
}

// Helper: write inquiries
function writeInquiries(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Auth middleware
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }
  const token = auth.slice(7);
  if (!tokens.has(token)) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
  next();
}

// POST /api/login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password !== PASSWORD) {
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  tokens.add(token);
  res.json({ token });
});

// POST /api/inquiries - submit a new inquiry
app.post('/api/inquiries', (req, res) => {
  const { 이름, 연락처, 이메일, 문의사항 } = req.body;

  if (!이름 || !연락처) {
    return res.status(400).json({ error: '이름과 연락처는 필수입니다.' });
  }

  const inquiry = {
    id: crypto.randomUUID(),
    이름: 이름 || '',
    연락처: 연락처 || '',
    이메일: 이메일 || '',
    문의사항: 문의사항 || '',
    접수일시: new Date().toISOString()
  };

  const inquiries = readInquiries();
  inquiries.push(inquiry);
  writeInquiries(inquiries);

  res.json({ success: true, message: '문의가 접수되었습니다.' });
});

// GET /api/inquiries - list all inquiries (auth required)
app.get('/api/inquiries', requireAuth, (req, res) => {
  const inquiries = readInquiries();
  // Return newest first
  inquiries.sort((a, b) => new Date(b.접수일시) - new Date(a.접수일시));
  res.json(inquiries);
});

// DELETE /api/inquiries/:id - delete an inquiry (auth required)
app.delete('/api/inquiries/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  let inquiries = readInquiries();
  const before = inquiries.length;
  inquiries = inquiries.filter(item => item.id !== id);
  if (inquiries.length === before) {
    return res.status(404).json({ error: '문의를 찾을 수 없습니다.' });
  }
  writeInquiries(inquiries);
  res.json({ success: true });
});

// Initialize data file if not exists
if (!fs.existsSync(DATA_FILE)) {
  writeInquiries([]);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
