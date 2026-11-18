-- Manual payment requests and support tickets.
ALTER TABLE payment_methods ADD COLUMN max_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE payment_methods ADD COLUMN bonus_pct REAL NOT NULL DEFAULT 0;
ALTER TABLE payment_methods ADD COLUMN qr_url TEXT;
CREATE TABLE manual_deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  method_id TEXT NOT NULL,
  amount REAL NOT NULL,
  credit_usd INTEGER NOT NULL DEFAULT 0,
  reference TEXT NOT NULL DEFAULT '',
  proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE INDEX manual_deposits_status ON manual_deposits(status,id DESC);
CREATE INDEX manual_deposits_user ON manual_deposits(user_id,id DESC);
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE INDEX tickets_status ON tickets(status,updated_at DESC);
CREATE INDEX tickets_user ON tickets(user_id,updated_at DESC);
CREATE TABLE ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  sender_role TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX ticket_messages_ticket ON ticket_messages(ticket_id,id);
UPDATE payment_methods SET kind='manual' WHERE id IN ('binance','crypto');
INSERT OR IGNORE INTO payment_methods (id,name,kind,currency,enabled,sort,details) VALUES
('paypal','PayPal','manual','USD',0,10,'Send payment to the PayPal account shown by the administrator.'),
('payoneer','Payoneer','manual','USD',0,11,'Send payment to the Payoneer account shown by the administrator.'),
('skrill','Skrill','manual','USD',0,12,'Send payment to the Skrill account shown by the administrator.'),
('payeer','Payeer','manual','USD',0,13,'Send payment to the Payeer account shown by the administrator.'),
('wise','Wise','manual','USD',0,14,'Send a Wise transfer using the bank details shown by the administrator.'),
('western_union','Western Union','manual','USD',0,15,'Send using the receiver details shown by the administrator.'),
('jazzcash','JazzCash','manual','PKR',0,16,'Send to the JazzCash account shown by the administrator.'),
('easypaisa','Easypaisa','manual','PKR',0,17,'Send to the Easypaisa account shown by the administrator.'),
('nagad','Nagad','manual','BDT',0,18,'Send to the Nagad account shown by the administrator.'),
('rocket','Rocket','manual','BDT',0,19,'Send to the Rocket account shown by the administrator.'),
('usdt_trc20','USDT TRC20','manual','USDT',0,20,'Send USDT on the TRC20 network only. Verify the network before sending.'),
('bitcoin','Bitcoin','manual','USD',0,21,'Send Bitcoin to the wallet address shown by the administrator.');
