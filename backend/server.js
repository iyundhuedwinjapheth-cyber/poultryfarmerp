const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'poultry-erp-jwt-secret-2026';

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');

function loadDb() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) { console.error('DB load error:', e.message); }
  return { users: [], flocks: [], records: [], feeds: [], sales: [], expenses: [], health: [] };
}

function saveDb(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8'); }

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// Seed default admin
const db_init = loadDb();
if (!db_init.users.find(u => u.username === 'admin')) {
  db_init.users.push({
    id: 'u1', username: 'admin', password: bcrypt.hashSync('poultry2024', 10),
    displayName: 'Farm Manager', role: 'admin', isActive: true, created_at: new Date().toISOString()
  });
  saveDb(db_init);
  console.log('Default admin created: admin / poultry2024');
}

// ---- AUTH MIDDLEWARE ----
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No auth' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

// ---- AUTH ----
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const d = loadDb();
  const user = d.users.find(u => u.username === username && u.isActive !== false);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token, username: user.username, displayName: user.displayName, role: user.role });
});

app.post('/api/change-passcode', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Passcode must be at least 4 characters' });
  const d = loadDb();
  const user = d.users.find(u => u.id === req.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Current passcode is incorrect' });
  }
  user.password = bcrypt.hashSync(newPassword, 10);
  saveDb(d);
  res.json({ success: true });
});

// ---- USER MANAGEMENT (admin only) ----
app.get('/api/users', auth, requireRole('admin'), (req, res) => {
  const d = loadDb();
  res.json(d.users.map(u => ({
    id: u.id, username: u.username, displayName: u.displayName, role: u.role, isActive: u.isActive, created_at: u.created_at
  })));
});

app.post('/api/users', auth, requireRole('admin'), (req, res) => {
  const { username, password, displayName, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 4) return res.status(400).json({ error: 'Passcode must be at least 4 characters' });
  const d = loadDb();
  if (d.users.find(u => u.username === username)) return res.status(400).json({ error: 'Username already exists' });
  const user = {
    id: genId(), username, password: bcrypt.hashSync(password, 10),
    displayName: displayName || username, role: role === 'admin' ? 'admin' : 'employee',
    isActive: true, created_at: new Date().toISOString()
  };
  d.users.push(user);
  saveDb(d);
  res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, isActive: user.isActive });
});

app.put('/api/users/:id', auth, requireRole('admin'), (req, res) => {
  const d = loadDb();
  const idx = d.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  if (req.body.password) d.users[idx].password = bcrypt.hashSync(req.body.password, 10);
  if (req.body.displayName) d.users[idx].displayName = req.body.displayName;
  if (req.body.role) d.users[idx].role = req.body.role === 'admin' ? 'admin' : 'employee';
  if (req.body.isActive !== undefined) d.users[idx].isActive = req.body.isActive;
  saveDb(d);
  res.json({ id: d.users[idx].id, username: d.users[idx].username, displayName: d.users[idx].displayName, role: d.users[idx].role, isActive: d.users[idx].isActive });
});

// ---- FLOCKS ----
app.get('/api/flocks', auth, (req, res) => {
  const d = loadDb();
  res.json(d.flocks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

app.post('/api/flocks', auth, requireRole('admin'), (req, res) => {
  const { name, breed, quantity, date, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const d = loadDb();
  const item = {
    id: genId(), name, breed: breed || 'Broiler', quantity: quantity || 0,
    date: date || new Date().toISOString().slice(0, 10), notes: notes || '',
    status: 'active', close_date: null,
    created_by: req.user.displayName || req.user.username, created_by_id: req.user.id,
    created_at: new Date().toISOString()
  };
  d.flocks.push(item);
  saveDb(d);
  res.json(item);
});

app.put('/api/flocks/:id', auth, requireRole('admin'), (req, res) => {
  const d = loadDb();
  const idx = d.flocks.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  Object.assign(d.flocks[idx], req.body);
  saveDb(d);
  res.json(d.flocks[idx]);
});

// ---- RECORDS ----
app.get('/api/records', auth, (req, res) => {
  const d = loadDb();
  let items = d.records;
  if (req.query.flock_id) items = items.filter(r => r.flock_id === req.query.flock_id);
  // Employees can only see their own records
  if (req.user.role === 'employee') items = items.filter(r => r.created_by_id === req.user.id);
  res.json(items.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/records', auth, (req, res) => {
  const { flock_id, date, dead, eggs, feed, notes } = req.body;
  if (!flock_id) return res.status(400).json({ error: 'flock_id required' });
  const d = loadDb();
  const item = {
    id: genId(), flock_id, date: date || new Date().toISOString().slice(0, 10),
    dead: dead || 0, eggs: eggs || 0, feed: feed || 0, notes: notes || '',
    created_by: req.user.displayName || req.user.username, created_by_id: req.user.id,
    created_at: new Date().toISOString()
  };
  d.records.push(item);
  saveDb(d);
  res.json(item);
});

// ---- FEEDS ----
app.get('/api/feeds', auth, (req, res) => {
  const d = loadDb();
  res.json(d.feeds.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/feeds', auth, requireRole('admin'), (req, res) => {
  const { flock_id, type, quantity, cost, date } = req.body;
  if (!flock_id) return res.status(400).json({ error: 'flock_id required' });
  const d = loadDb();
  const item = {
    id: genId(), flock_id, type: type || 'Starter', quantity: quantity || 0,
    cost: cost || 0, date: date || new Date().toISOString().slice(0, 10),
    created_by: req.user.displayName || req.user.username, created_by_id: req.user.id,
    created_at: new Date().toISOString()
  };
  d.feeds.push(item);
  saveDb(d);
  res.json(item);
});

// ---- SALES (admin only) ----
app.get('/api/sales', auth, requireRole('admin'), (req, res) => {
  const d = loadDb();
  res.json(d.sales.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/sales', auth, requireRole('admin'), (req, res) => {
  const { flock_id, type, qty, price, amount, date, buyer, avgWeight } = req.body;
  if (!flock_id) return res.status(400).json({ error: 'flock_id required' });
  const d = loadDb();
  const amt = amount ?? (qty * price);
  const item = {
    id: genId(), flock_id, type: type || 'Eggs', qty: qty || 1, price: price || 0,
    amount: amt, avgWeight: avgWeight || 0,
    date: date || new Date().toISOString().slice(0, 10),
    buyer: buyer || '', created_by: req.user.displayName || req.user.username,
    created_by_id: req.user.id, created_at: new Date().toISOString()
  };
  d.sales.push(item);
  saveDb(d);
  res.json(item);
});

// ---- EXPENSES (admin only) ----
app.get('/api/expenses', auth, requireRole('admin'), (req, res) => {
  const d = loadDb();
  res.json(d.expenses.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/expenses', auth, requireRole('admin'), (req, res) => {
  const { flock_id, category, amount, date, notes } = req.body;
  if (!flock_id) return res.status(400).json({ error: 'flock_id required' });
  const d = loadDb();
  const item = {
    id: genId(), flock_id, category: category || 'Other', amount: amount || 0,
    date: date || new Date().toISOString().slice(0, 10), notes: notes || '',
    created_by: req.user.displayName || req.user.username, created_by_id: req.user.id,
    created_at: new Date().toISOString()
  };
  d.expenses.push(item);
  saveDb(d);
  res.json(item);
});

// ---- HEALTH (everyone can view, admin can create) ----
app.get('/api/health', auth, (req, res) => {
  const d = loadDb();
  let items = d.health || [];
  if (req.query.flock_id) items = items.filter(h => h.flock_id === req.query.flock_id);
  if (req.query.overdue) {
    const today = new Date().toISOString().slice(0, 10);
    items = items.filter(h => h.next_due_date && h.next_due_date <= today && !h.completed);
  }
  res.json(items.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/health', auth, requireRole('admin'), (req, res) => {
  const { flock_id, type, name, date, next_due_date, notes } = req.body;
  if (!flock_id || !name) return res.status(400).json({ error: 'flock_id and name required' });
  const d = loadDb();
  const item = {
    id: genId(), flock_id, type: type || 'Vaccine', name, completed: false,
    date: date || new Date().toISOString().slice(0, 10),
    next_due_date: next_due_date || null, notes: notes || '',
    created_by: req.user.displayName || req.user.username, created_by_id: req.user.id,
    created_at: new Date().toISOString()
  };
  if (!d.health) d.health = [];
  d.health.push(item);
  saveDb(d);
  res.json(item);
});

app.put('/api/health/:id', auth, requireRole('admin'), (req, res) => {
  const d = loadDb();
  if (!d.health) d.health = [];
  const idx = d.health.findIndex(h => h.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  Object.assign(d.health[idx], req.body);
  saveDb(d);
  res.json(d.health[idx]);
});

// ---- EXPORT (admin only) ----
app.get('/api/export', auth, requireRole('admin'), (req, res) => {
  const d = loadDb();
  res.json({ ...d, exported: new Date().toISOString() });
});

// ---- ME ----
app.get('/api/me', auth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, displayName: req.user.displayName, role: req.user.role });
});

// ---- SERVE FRONTEND ----
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('PoultryERP server running on http://0.0.0.0:' + PORT);
});
