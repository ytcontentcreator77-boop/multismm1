-- User display currency and provider-backed free-service claims.
ALTER TABLE users ADD COLUMN currency TEXT NOT NULL DEFAULT 'USDT';
CREATE TABLE free_services (
  service_id INTEGER PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  min_qty INTEGER NOT NULL,
  max_qty INTEGER NOT NULL,
  reset_seconds INTEGER NOT NULL DEFAULT 86400,
  created_at INTEGER NOT NULL
);
CREATE TABLE free_service_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE free_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  order_id INTEGER,
  claimed_at INTEGER NOT NULL
);
CREATE INDEX free_claims_user_service ON free_claims(user_id, service_id, claimed_at DESC);
INSERT OR IGNORE INTO currencies (code,name,symbol,per_usd) VALUES
('USDT','Tether USD','USDT',1),('CHF','Swiss Franc','CHF',0.88),('CNY','Chinese Yuan','¥',7.2),('HKD','Hong Kong Dollar','HK$',7.8),
('SGD','Singapore Dollar','S$',1.35),('NZD','New Zealand Dollar','NZ$',1.65),('MXN','Mexican Peso','MX$',17),('ZAR','South African Rand','R',18.5),
('KES','Kenyan Shilling','KSh',129),('GHS','Ghanaian Cedi','GH₵',15),('UGX','Ugandan Shilling','USh',3800),('TZS','Tanzanian Shilling','TSh',2550),
('ETB','Ethiopian Birr','Br',57),('MAD','Moroccan Dirham','د.م.',10),('QAR','Qatari Riyal','ر.ق',3.64),('KWD','Kuwaiti Dinar','د.ك',0.31),
('BHD','Bahraini Dinar','BD',0.376),('OMR','Omani Rial','ر.ع.',0.385),('JOD','Jordanian Dinar','د.ا',0.709),('ILS','Israeli Shekel','₪',3.7),
('UAH','Ukrainian Hryvnia','₴',41),('PLN','Polish Zloty','zł',4),('CZK','Czech Koruna','Kč',23),('HUF','Hungarian Forint','Ft',365),
('SEK','Swedish Krona','kr',10.5),('NOK','Norwegian Krone','kr',10.6),('DKK','Danish Krone','kr',6.9),('CLP','Chilean Peso','$',950),
('ARS','Argentine Peso','$',1000),('COP','Colombian Peso','$',4200),('PEN','Peruvian Sol','S/',3.75),('TWD','New Taiwan Dollar','NT$',32);
