import ExcelJS from "exceljs";

/** A tiny Ship Cost History workbook (one UPS package, one USPS label). */
export async function costReportXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("UPS and USPS");
  const cols = ["shipsource", "transactiondate", "trackingnumber", "weight", "billedweight", "zone", "transactionamount", "originzip", "destinationname", "destinationcity", "destinationstate", "ups_chargeclasscode", "ups_chargedescription"];
  ws.addRow(cols);
  ws.addRow(["UPS", "2026-11-01", "1Z7963050000000001", "", "2", "008", 9.35, "", "A Person", "CHARLOTTE", "NC", "FRT", "Ground Residential"]);
  ws.addRow(["USPS", "2026-11-02", "9400000000000001", "0.4", "", "", 6.1, "89113", "B Person", "PHOENIX", "AZ", "", ""]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
