"""Stand-in for Salsify's products endpoint (docs screenshots only): a 25-product sample list, paged with a cursor.
Usage: python3 scripts/docs/stand_in_salsify.py"""
import json, random
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

random.seed(7)
NAMES = ["Tire Inner Liner Scraper", "Valve Core Tool", "Lug Nut Socket Set", "Brake Bleeder Kit", "Magnetic Pickup Tool", "Hose Clamp Pliers",
         "Oil Filter Wrench", "Spark Plug Gap Gauge", "Battery Terminal Cleaner", "Feeler Gauge Set", "Tap and Die Set", "Torque Wrench 1/2 in",
         "Creeper Seat", "Floor Jack 3 Ton", "Bench Grinder Stand", "Impact Socket Set", "Mechanic Stethoscope", "Pry Bar Set",
         "Wheel Weight Hammer", "Bead Breaker", "Hub Puller Kit", "Drum Brake Tool", "Pickup Tool Telescoping", "Tire Spoon Set", "Wire Brush Set"]
products = []
for i, name in enumerate(NAMES):
    pid = f"{(i + 28):05d}-S"
    w = round(random.choice([0.3, 0.6, 1.2, 2.5, 4.0, 7.5, 12.0, 24.0, 38.0]), 2)
    l, wd, h = sorted([random.choice([6, 9, 12, 14, 18, 24, 30]), random.choice([4, 6, 8, 10, 14]), random.choice([2, 3, 4, 6, 10])], reverse=True)
    rec = {"salsify:id": pid, "Part Number": pid, "Item Name": {"en-US": name}, "Shipping Packaging Type": random.choice(["Bubble Mailer", "Box", "Box"])}
    if i % 9 == 4:      # UPC values only
        rec.update({"UPC Weight (Pounds)": str(w), "UPC Length (Inches)": str(l), "UPC Width (Inches)": str(wd), "UPC Height (Inches)": str(h)})
    elif i % 11 == 7:   # nothing at all
        pass
    else:
        rec.update({"Shipping Weight (Pounds)": f"{w:.2f}", "Shipping Length (Inches)": f"{l:.2f}", "Shipping Width (Inches)": f"{wd:.2f}", "Shipping Height (Inches)": f"{h:.2f}"})
    products.append(rec)

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if not u.path.endswith("/products") or not q.get("filter", [""])[0].startswith("=list:"):
            self.send_response(404); self.end_headers(); return
        per = int(q.get("per_page", ["100"])[0]); per = min(per, 10)
        start = int(q.get("cursor", ["0"])[0])
        page = products[start:start + per]
        nxt = str(start + per) if start + per < len(products) else None
        body = json.dumps({"data": page, "meta": {"cursor": nxt, "total_entries": len(products)}}).encode()
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass

HTTPServer(("127.0.0.1", 8098), H).serve_forever()
