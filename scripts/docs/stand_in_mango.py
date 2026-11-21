"""Stand-in for Mango's inventory page (docs screenshots and demos only): serves pages in the same layout
as /orders/project-mango/current_inventory?it=<item> with made-up stock and shipments per item.
Usage: python3 scripts/docs/stand_in_mango.py   (listens on 127.0.0.1:8096)"""
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

LV, GV = "796305", "9X0F53"  # demo UPS accounts for Las Vegas and Groveport

def profile(item):
    n = int(hashlib.md5(item.encode()).hexdigest(), 16)
    kind = n % 5
    if kind == 0: return (0, 40 + n % 900, [GV] * (5 + n % 9))                  # Groveport only, own shipments
    if kind == 1: return (30 + n % 400, 0, [LV] * (n % 3))                       # Las Vegas only, few shipments
    if kind == 2: return (20 + n % 300, 50 + n % 600, [LV] * (2 + n % 4) + [GV] * (5 + n % 6))  # both, own shipments
    if kind == 3: return (10 + n % 200, 10 + n % 200, [])                        # both stocked, no shipments
    return (0, 0, [])                                                            # nothing in stock

def order_row(i, item, account, qty):
    track = f"1Z{account}03{i:08d}"
    return f"""<tr align="center"><td style="display:none;"></td><td></td><th>PO-DEMO-{i:04d}</th><td>S-ORD{i:07d}</td>
<td><span class="badge badge-success">Complete</span><a href='#'> Update</a></td><th>11/{(i % 18) + 1:02d}/2026 08:30am</th>
<td><a href='#' target='blank'> {track}</a></td><td>2026-11-{(i % 18) + 1:02d} 10:00:00</td><td>GND</td><td>{qty}</td>
<th>ID: <a href='#'>{item}</a>&nbspQty:{qty}<br></c></th></tr>"""

def page(item):
    lv, gv, ships = profile(item)
    rows = "".join(order_row(i + 1, item, acct, 1 + i % 3) for i, acct in enumerate(ships))
    return f"""<!DOCTYPE html><html><head><title>Inventory - {item}</title></head><body><main class="main">
<div class="card-header">Inventory History for Item <b>{item}</b></div>
<table width="100%"><thead><tr><td colspan="2">Item Number<h3>{item}</h3></td><td colspan="6">Item Description<h3>Demo product {item}</h3></td></tr></thead></table>
<div id="items" style="display:none"><table class="table"><thead class="table-active"><tr align="center"><td style="display:none;"></td>
<th>Marketplace</th><th>Customer PO</th><th>SO Number</th><th>Status</th><th>Order Date</th><th>Tracking Number</th><th>Shipping Date</th><th>Carrier</th><th>Qty</th><th>Items Array</th>
</tr></thead><tbody>{rows}</tbody></table></div>
<div id="history"><span><b>{item}</b> had <font color="green"><b>{len(ships) * 2}</b></font> unit sales through mango in the last month</span>
<table class="table"><thead class="table-active"><tr align="center"><td style="display:none;"></td><th>Update Date</th><th>Quantity on Hand</th><th>Allocated Quantity</th><th>PNA</th><th>Reported Inventory</th>
<th>Quantity Site 0</th><th>Allocated Site 0</th><th>Quantity Site 1</th><th>Allocated Site 1</th><th>Quantity Site 3</th><th>Allocated Site 3</th></tr></thead>
<tbody><tr align="center"><td style="display:none;"></td><th>11/20 - 01:15am</th><th>{lv + gv}</th><th>0</th><th>0</th><th>{lv + gv}</th><th>{lv}</th><th>0</th><th>0</th><th>0</th><th>{gv}</th><th>0</th></tr></tbody></table></div>
</main></body></html>"""

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        item = (parse_qs(urlparse(self.path).query).get("it") or [""])[0]
        body = page(item) if item and item != "00031-S" else "<html><body>No item found</body></html>"  # one unknown item
        self.send_response(200); self.send_header("content-type", "text/html"); self.end_headers(); self.wfile.write(body.encode())
    def log_message(self, *a): pass

HTTPServer(("127.0.0.1", 8096), H).serve_forever()
