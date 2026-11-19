-- StockRoom Lite 1.2: the product was renamed from Binwright Lite. Points the default "ask about setup" link at the new page.
-- Only changes the value if nobody has set their own address.
UPDATE `app_settings` SET `setup_help_url` = 'https://redcenterstudio.com/stockroom/' WHERE `setup_help_url` = 'https://redcenterstudio.com/binwright/';
