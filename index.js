import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

let mongoUri = 'mongodb+srv://tamilselvansk_db_user:aFS0lEjrpFYpItJL@cluster0.fpe53r9.mongodb.net/?appName=Cluster0';
let dbError = null;
let dbReady = false;
let memoryServer = null;

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

const itemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, trim: true, sparse: true },
  category: { type: String, default: 'General' },
  price: { type: Number, required: true, default: 0 },
  stock: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

const invoiceSchema = new mongoose.Schema({
  invoice_no: { type: String, required: true, unique: true, trim: true },
  customer_name: { type: String, required: true, trim: true },
  supplier_name: { type: String, default: '' },
  supplier_address: { type: String, default: '' },
  supplier_phone: { type: String, default: '' },
  invoice_date: { type: String, required: true },
  total: { type: Number, required: true, default: 0 },
  status: { type: String, enum: ['Paid', 'Pending', 'Overdue'], default: 'Pending' },
  gst_rate: { type: Number, default: 18 },
  items: [{
    item_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, default: 1 },
    unit_price: { type: Number, default: 0 },
    name: { type: String, default: '' }
  }],
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

userSchema.index({ email: 1 }, { unique: true });
itemSchema.index({ sku: 1 }, { unique: true, sparse: true });

const User = mongoose.model('User', userSchema);
const Item = mongoose.model('Item', itemSchema);
const Supplier = mongoose.model('Supplier', supplierSchema);
const Invoice = mongoose.model('Invoice', invoiceSchema);

const toApiDoc = (doc) => {
  if (!doc) return null;
  const data = doc.toObject ? doc.toObject() : { ...doc };
  const { _id, ...rest } = data;
  return { id: _id?.toString ? _id.toString() : _id, ...rest };
};

const toInvoiceResponse = (invoice) => {
  if (!invoice) return null;
  const data = invoice.toObject ? invoice.toObject() : { ...invoice };
  const { _id, ...rest } = data;
  return {
    id: _id?.toString ? _id.toString() : _id,
    ...rest,
    items: (rest.items || []).map((item) => ({
      item_id: item.item_id?.toString ? item.item_id.toString() : item.item_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      name: item.name || ''
    }))
  };
};

async function seedData() {
  const userCount = await User.countDocuments();
  if (userCount === 0) {
    await User.insertMany([
      { name: 'Admin User', email: 'admin@ledgerly.in', password: 'admin123', role: 'admin' },
      { name: 'Billing User', email: 'user@ledgerly.in', password: 'user123', role: 'user' }
    ]);
    console.log('Seeded default login accounts into MongoDB users collection.');
  }

  const itemCount = await Item.countDocuments();
  if (itemCount === 0) {
    await Item.insertMany([
      { name: 'Wireless Headphones', sku: 'WH-2401', category: 'Electronics', price: 2499, stock: 24 },
      { name: 'USB-C Cable', sku: 'UC-1102', category: 'Accessories', price: 499, stock: 67 },
      { name: 'Desk Lamp', sku: 'DL-3320', category: 'Office', price: 1699, stock: 14 }
    ]);
    console.log('Seeded starter items into MongoDB items collection.');
  }

  const supplierCount = await Supplier.countDocuments();
  if (supplierCount === 0) {
    await Supplier.insertMany([
      { name: 'Apex Electronics Co.', email: 'sales@apexelectronics.in', phone: '+91 98765 43210', address: '12 Industrial Estate, Bengaluru, KA' },
      { name: 'Nexus Accessories', email: 'info@nexusacc.com', phone: '+91 98123 45678', address: '45 Logistics Park, Mumbai, MH' }
    ]);
    console.log('Seeded starter suppliers into MongoDB suppliers collection.');
  }
}

async function initDatabase() {
  dbError = null;
  dbReady = false;
  console.log(`Connecting to MongoDB at ${mongoUri}...`);

  console.error("Atlas connection failed:");
  

  

  
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000
    });

    dbReady = true;
    await seedData();
    console.log('✅ SUCCESS: Connected to MongoDB and collections are ready!');
  } catch (err) {
    dbError = err.message;
    dbReady = false;

    try {
      memoryServer = await MongoMemoryServer.create();
      mongoUri = memoryServer.getUri();
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 10000
      });
      dbReady = true;
      await seedData();
      console.log('✅ SUCCESS: Connected to local in-memory MongoDB fallback.');
    } catch (fallbackErr) {
      dbError = fallbackErr.message;
      console.error('❌ ERROR: MongoDB connection failed:', err.message);
      console.error('Please verify your MONGO_URI or DB_URI in your .env file.');
    }
  }
}

initDatabase();

const requireDb = (req, res, next) => {
  if (!dbReady || mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: `MongoDB not connected. Error: ${dbError || 'Connection refused'}.`
    });
  }
  next();
};

app.get('/api/health', async (_, res) => {
  if (!dbReady || mongoose.connection.readyState !== 1) {
    return res.status(503).json({ status: 'error', database: 'disconnected', message: dbError });
  }

  try {
    await mongoose.connection.db.admin().ping();
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected', message: err.message });
  }
});

app.post('/api/auth/login', requireDb, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() }).lean();
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({ id: user._id.toString(), name: user.name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', requireDb, async (_, res) => {
  try {
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 }).lean();
    res.json(users.map((user) => ({ ...user, id: user._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', requireDb, async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists in MongoDB' });
    }

    const createdUser = await User.create({
      name,
      email: normalizedEmail,
      password,
      role
    });

    res.status(201).json({ id: createdUser._id.toString(), name: createdUser.name, email: createdUser.email, role: createdUser.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', requireDb, async (req, res) => {
  try {
    const { id } = req.params;
    await User.deleteOne({ _id: id });
    res.json({ message: 'User deleted from MongoDB' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/items', requireDb, async (_, res) => {
  try {
    const items = await Item.find({}).sort({ name: 1 }).lean();
    res.json(items.map((item) => ({ ...item, id: item._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', requireDb, async (req, res) => {
  try {
    const { name, sku, category = 'General', price, stock = 0 } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Item name and price are required' });
    }

    const createdItem = await Item.create({
      name,
      sku: sku || undefined,
      category,
      price,
      stock
    });

    res.status(201).json({ id: createdItem._id.toString(), name: createdItem.name, sku: createdItem.sku, category: createdItem.category, price: createdItem.price, stock: createdItem.stock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', requireDb, async (req, res) => {
  try {
    const { id } = req.params;
    await Item.deleteOne({ _id: id });
    res.json({ message: 'Item deleted from MongoDB' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/suppliers', requireDb, async (_, res) => {
  try {
    const suppliers = await Supplier.find({}).sort({ name: 1 }).lean();
    res.json(suppliers.map((supplier) => ({ ...supplier, id: supplier._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suppliers', requireDb, async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const createdSupplier = await Supplier.create({
      name,
      email: email || '',
      phone: phone || '',
      address: address || ''
    });

    res.status(201).json({ id: createdSupplier._id.toString(), name: createdSupplier.name, email: createdSupplier.email, phone: createdSupplier.phone, address: createdSupplier.address });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suppliers/:id', requireDb, async (req, res) => {
  try {
    const { id } = req.params;
    await Supplier.deleteOne({ _id: id });
    res.json({ message: 'Supplier deleted from MongoDB' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/invoices', requireDb, async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = {};

    if (from && to) {
      filter.invoice_date = { $gte: String(from), $lte: String(to) };
    }

    const invoices = await Invoice.find(filter).sort({ invoice_date: -1, createdAt: -1 }).lean();
    res.json(invoices.map((invoice) => toInvoiceResponse({ ...invoice, _id: invoice._id })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/invoices/:id', requireDb, async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const supplier = invoice.supplier_name ? await Supplier.findOne({ name: invoice.supplier_name }) : null;
    const response = toInvoiceResponse(invoice);
    response.supplier_address = invoice.supplier_address || supplier?.address || '';
    response.supplier_phone = invoice.supplier_phone || supplier?.phone || '';

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices', requireDb, async (req, res) => {
  const {
    invoice_no,
    customer_name,
    supplier_name = '',
    supplier_address = '',
    supplier_phone = '',
    invoice_date,
    items = [],
    total,
    status = 'Pending',
    gst_rate = 18
  } = req.body;

  if (!invoice_no || !customer_name || !invoice_date || !items.length) {
    return res.status(400).json({ error: 'Missing required invoice details or line items' });
  }

  try {
    const normalizedItems = items.map((line) => {
      const itemId = line.itemId || line.item_id || line.item?.id || line.item;
      return {
        item_id: itemId,
        quantity: Number(line.quantity || 1),
        unit_price: Number(line.unitPrice ?? line.unit_price ?? 0),
        name: line.name || ''
      };
    });

    const createdInvoice = await Invoice.create({
      invoice_no,
      customer_name,
      supplier_name,
      supplier_address,
      supplier_phone,
      invoice_date,
      gst_rate,
      total,
      status,
      items: normalizedItems
    });

    for (const line of normalizedItems) {
      const itemId = line.item_id;
      const quantity = Number(line.quantity || 1);

      if (itemId) {
        await Item.updateOne({ _id: itemId }, { $inc: { stock: -quantity } });
      }
    }

    res.status(201).json({ id: createdInvoice._id.toString(), invoice_no, total });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/invoices/:id', requireDb, async (req, res) => {
  try {
    const { id } = req.params;
    await Invoice.deleteOne({ _id: id });
    res.json({ message: 'Invoice deleted from MongoDB' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Ledgerly MongoDB API server running on port ${PORT}`));
