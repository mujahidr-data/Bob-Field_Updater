/**
 * Bob Automation - Consolidated Google Apps Script
 * 
 * @fileoverview Comprehensive automation script for Bob (HiBob) HR platform integration
 * 
 * This consolidated script provides:
 * 1. Salary Data Management
 *    - Import Base Data, Bonus History, Compensation History
 *    - Automatic tenure calculations
 *    - Data normalization and formatting
 * 
 * 2. Performance Report Automation
 *    - Web interface for downloading performance reports
 *    - Credentials management
 *    - Automated upload to Google Sheets
 * 
 * 3. Field Uploader
 *    - Update single field for multiple employees
 *    - Field selection with search functionality
 *    - Data validation and batch updates
 * 
 * @author Bob Automation Team
 * @version 2.0.0
 * @since 2024
 * 
 * Requirements:
 * - Bob API credentials (BOB_ID, BOB_KEY) in Script Properties
 * - Google Sheets API access
 * - Appropriate permissions for Bob API endpoints
 */

// ============================================================================
// CONSTANTS - Salary Data
// ============================================================================

const BOB_REPORT_IDS = {
  BASE_DATA: "31048356",
  BONUS_HISTORY: "31054302",
  COMP_HISTORY: "31054312",
  FULL_COMP_HISTORY: "31168524"
};

const SHEET_NAMES = {
  BASE_DATA: "Base Data",
  BONUS_HISTORY: "Bonus History",
  COMP_HISTORY: "Comp History",
  FULL_COMP_HISTORY: "Full Comp History",
  PERF_REPORT: "Bob Perf Report",
  UPLOADER: "Uploader",
  BOB_FIELDS_META: "Bob Fields Meta Data",
  BOB_LISTS: "Bob Lists",
  EMPLOYEES: "Employees",
  HISTORY_UPLOADER: "History Uploader"
};

const WRITE_COLS = 23; // Column W - limit for Base Data sheet
const ALLOWED_EMP_TYPES = new Set(["Permanent", "Regular Full-Time"]);

// ============================================================================
// CONSTANTS - Performance Reports
// ============================================================================

const PERF_SHEET_ID = '1rnpUlOcqTpny2Pve2L82qWGI9WplOetx-1Wba7ONoeA';

// ============================================================================
// CONSTANTS - Field Uploader
// ============================================================================

const UPLOADER_START_ROW = 8; // Data starts at row 8
const UPLOADER_CIQ_ID_COL = 1; // Column A
const UPLOADER_VALUE_COL = 2; // Column B

// ============================================================================
// UI FUNCTIONS - Menu
// ============================================================================

/**
 * Creates unified menu when spreadsheet is opened
 * Combines Salary Data, Performance Report, and Field Uploader functions
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 Bob Automation')
    // Salary Data Import Functions
    .addSubMenu(ui.createMenu('Salary Data')
      .addItem('Import Base Data', 'importBobDataSimpleWithLookup')
      .addItem('Import Bonus History', 'importBobBonusHistoryLatest')
      .addItem('Import Compensation History', 'importBobCompHistoryLatest')
      .addItem('Import Full Comp History', 'importBobFullCompHistory')
      .addSeparator()
      .addItem('Import All Data', 'importAllBobData')
      .addSeparator()
      .addItem('Convert Tenure to Array Formula', 'convertTenureToArrayFormula'))
    .addSeparator()
    // Performance Reports Submenu
    .addSubMenu(ui.createMenu('Performance Reports')
      .addItem('🚀 Launch Web Interface', 'launchWebInterface')
      .addSeparator()
      .addItem('Set HiBob Credentials', 'setHiBobCredentials')
      .addItem('View Credentials Status', 'viewCredentialsStatus')
      .addSeparator()
      .addItem('📖 Instructions & Help', 'showPerformanceReportInstructions'))
    .addSeparator()
    // Field Uploader Submenu
    .addSubMenu(ui.createMenu('Field Uploader')
      .addSubMenu(ui.createMenu('SETUP')
        .addItem('1. Pull Fields', 'pullFields')
        .addItem('2. Pull Lists', 'pullLists')
        .addItem('3. Pull Employees', 'pullEmployees')
        .addItem('>> Refresh Employees (Keep Filters)', 'refreshEmployeesKeepFilters')
        .addSeparator()
        .addItem('4. Setup Field Uploader', 'setupFieldUploader')
        .addItem('5. Select Field to Update', 'selectFieldToUpdate'))
      .addSeparator()
      .addSubMenu(ui.createMenu('VALIDATE')
        .addItem('Validate Field Upload Data', 'validateFieldUploadData'))
      .addSeparator()
      .addSubMenu(ui.createMenu('UPLOAD')
        .addItem('Upload Field Updates', 'uploadFieldUpdates')))
    .addToUi();
}

// ============================================================================
// SALARY DATA FUNCTIONS
// ============================================================================

/**
 * Runs all import functions in sequence
 */
function importAllBobData() {
  try {
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      'Import All Data',
      'This will import Base Data, Bonus History, and Compensation History. This may take a few minutes. Continue?',
      ui.ButtonSet.YES_NO
    );
    
    if (response !== ui.Button.YES) return;
    
    Logger.log('Starting full data import...');
    importBobDataSimpleWithLookup();
    Logger.log('1/4: Base Data imported');
    
    importBobBonusHistoryLatest();
    Logger.log('2/4: Bonus History imported');
    
    importBobCompHistoryLatest();
    Logger.log('3/4: Compensation History imported');
    
    importBobFullCompHistory();
    Logger.log('4/4: Full Comp History imported');
    
    Logger.log('All imports completed successfully!');
    ui.alert('Success', 'All data has been imported successfully!', ui.ButtonSet.OK);
  } catch (error) {
    Logger.log(`Error in importAllBobData: ${error.message}`);
    SpreadsheetApp.getUi().alert('Error', `Failed to import all data: ${error.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}

/**
 * Converts individual tenure formulas to a single array formula for better performance
 */
function convertTenureToArrayFormula() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    
    let headerRow = 1, tenureCol = -1, startDateCol = -1;
    
    for (let r = 1; r <= 30; r++) {
      const row = sheet.getRange(r, 1, 1, 20).getValues()[0];
      const tenureIdx = row.findIndex(cell => cell && String(cell).toLowerCase().includes("tenure"));
      const startDateIdx = row.findIndex(cell => 
        cell && (String(cell).toLowerCase().includes("start date") || String(cell).toLowerCase().includes("startdate"))
      );
      
      if (tenureIdx !== -1) {
        headerRow = r;
        tenureCol = tenureIdx + 1;
        if (startDateIdx !== -1) startDateCol = startDateIdx + 1;
        break;
      }
    }
    
    if (tenureCol === -1) {
      SpreadsheetApp.getUi().alert('Error', 'Could not find "Tenure" column in the active sheet.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    if (startDateCol === -1) startDateCol = 3; // Default to column C
    
    const startDateColLetter = columnToLetter(startDateCol);
    const tenureColLetter = columnToLetter(tenureCol);
    const firstDataRow = headerRow + 1;
    const lastRow = sheet.getLastRow();
    
    if (lastRow < firstDataRow) {
      SpreadsheetApp.getUi().alert('Error', 'No data rows found below the header.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    const tenureRange = sheet.getRange(firstDataRow, tenureCol, lastRow - firstDataRow + 1, 1);
    tenureRange.clearContent();
    
    const arrayFormula = `=ARRAYFORMULA(IF(${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastRow}="", "", IF((TODAY()-${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastRow})>=1460, "4 Years+", IF((TODAY()-${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastRow})>=1095, "3 Years", IF((TODAY()-${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastRow})>=730, "2 Years", IF((TODAY()-${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastRow})>=545, "1.5 Years", IF((TODAY()-${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastRow})>=365, "1 Year", IF((TODAY()-${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastRow})>=180, "6 Months", "Less than 6 Months"))))))))`;
    
    sheet.getRange(firstDataRow, tenureCol).setFormula(arrayFormula);
    Logger.log(`Converted tenure formulas to array formula in column ${tenureColLetter}`);
    SpreadsheetApp.getUi().alert('Success', `Converted tenure formulas to array formula in column ${tenureColLetter}!`, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (error) {
    Logger.log(`Error in convertTenureToArrayFormula: ${error.message}`);
    SpreadsheetApp.getUi().alert('Error', `Failed to convert tenure formulas: ${error.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}

/**
 * Imports base employee data from Bob API
 */
function importBobDataSimpleWithLookup() {
  try {
    const reportId = BOB_REPORT_IDS.BASE_DATA;
    const sheetName = SHEET_NAMES.BASE_DATA;
    const bonusSheetName = SHEET_NAMES.BONUS_HISTORY;
    
    Logger.log(`Starting import of ${sheetName}...`);
    const rows = fetchBobReport(reportId);
    const srcHeader = rows[0];
    const normalizedHeader = normalizeHeader(srcHeader);
    
    const idxEmpId = findColCached(normalizedHeader, srcHeader, ["Employee ID", "Emp ID", "Employee Id"]);
    const idxJobLevel = findColCached(normalizedHeader, srcHeader, ["Job Level", "Job level"]);
    const idxBasePay = findColCached(normalizedHeader, srcHeader, ["Base Pay", "Base salary", "Base Salary"]);
    const idxEmpType = findColCached(normalizedHeader, srcHeader, ["Employment Type", "Employment type"]);
    const idxStartDate = findColCached(normalizedHeader, srcHeader, ["Start Date", "Start date", "Original start date", "Original Start Date"]);
    const idxTermination = findColCached(normalizedHeader, srcHeader, ["Termination Date", "Termination date"]);
    
    let header = [...srcHeader, "Variable Type", "Variable %"];
    const out = [header];
  
    for (let r = 1; r < rows.length; r++) {
      const src = rows[r];
      if (!src || !Array.isArray(src) || src.length === 0) continue;
      
      const row = src.slice();
      const empType = safeCell(row, idxEmpType);
      if (!ALLOWED_EMP_TYPES.has(empType)) continue;
      
      const empId = safeCell(row, idxEmpId);
      const jobLvl = safeCell(row, idxJobLevel);
      if (!empId || !jobLvl) continue;
      
      const empIdNum = toNumberSafe(empId);
      row[idxEmpId] = isFinite(empIdNum) ? String(empIdNum) : empId.trim();
      
      const basePayNum = toNumberSafe(safeCell(row, idxBasePay));
      if (!isFinite(basePayNum) || basePayNum === 0) continue;
      
      row[idxBasePay] = basePayNum;
      row.push("", ""); // Variable Type, Variable %
      out.push(row);
    }
    
    Logger.log(`Processed ${out.length - 1} rows for ${sheetName}`);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    const sliced = out.map(r => r.slice(0, WRITE_COLS));
    
    const rowsToClear = Math.max(sheet.getMaxRows(), sliced.length);
    sheet.getRange(1, 1, rowsToClear, WRITE_COLS).clearContent();
    
    const dataRange = sheet.getRange(1, 1, sliced.length, sliced[0].length);
    dataRange.setValues(sliced);
    
    const maxRows = sheet.getMaxRows();
    const dataRows = sliced.length;
    if (maxRows > dataRows) {
      sheet.deleteRows(dataRows + 1, maxRows - dataRows);
    }
    
    dataRange.setFontFamily("Roboto");
    dataRange.setFontSize(10);
    sheet.autoResizeColumns(1, sliced[0].length);
    
    const numRows = sliced.length - 1;
    const firstDataRow = 2;
    
    if (numRows > 0) {
      if (idxEmpId + 1 <= WRITE_COLS) {
        const empIdRange = sheet.getRange(firstDataRow, idxEmpId + 1, numRows, 1);
        empIdRange.setNumberFormat("@");
        const empIdValues = empIdRange.getValues();
        empIdRange.setValues(empIdValues.map(row => [String(row[0])]));
      }
      
      if (idxBasePay + 1 <= WRITE_COLS) {
        sheet.getRange(firstDataRow, idxBasePay + 1, numRows, 1).setNumberFormat("#,##0.00");
      }
      
      const bonusSheet = ss.getSheetByName(bonusSheetName);
      if (bonusSheet) {
        const vtCol = header.indexOf("Variable Type") + 1;
        const vpCol = header.indexOf("Variable %") + 1;
        const empIdColLetter = columnToLetter(idxEmpId + 1);
        
        if (vtCol > 0 && vtCol <= WRITE_COLS) {
          const vtFormulas = Array.from({ length: numRows }, (_, i) =>
            [`=XLOOKUP($${empIdColLetter}${firstDataRow + i}, '${bonusSheetName}'!A:A, '${bonusSheetName}'!D:D, "")`]
          );
          sheet.getRange(firstDataRow, vtCol, numRows, 1).setFormulas(vtFormulas);
        }
        
        if (vpCol > 0 && vpCol <= WRITE_COLS) {
          const vpFormulas = Array.from({ length: numRows }, (_, i) =>
            [`=XLOOKUP($${empIdColLetter}${firstDataRow + i}, '${bonusSheetName}'!A:A, '${bonusSheetName}'!E:E, "")`]
          );
          sheet.getRange(firstDataRow, vpCol, numRows, 1).setFormulas(vpFormulas);
        }
      }
      
      if (idxStartDate >= 0 && idxStartDate < header.length) {
        const startDateColLetter = columnToLetter(idxStartDate + 1);
        const tenureCategoryHeaderIndex = header.indexOf("Tenure Category");
        let tenureCol = tenureCategoryHeaderIndex !== -1 ? tenureCategoryHeaderIndex + 1 : 
                       (header.length < WRITE_COLS ? header.length + 1 : WRITE_COLS + 1);
        
        if (tenureCategoryHeaderIndex === -1) {
          sheet.getRange(1, tenureCol).setValue("Tenure Category");
        }
        
        const lastRow = sheet.getLastRow();
        if (lastRow >= firstDataRow) {
          sheet.getRange(firstDataRow, tenureCol, lastRow - firstDataRow + 1, 1).clearContent();
        }
        
        const lastDataRow = firstDataRow + numRows - 1;
        const arrayFormula = `=ARRAYFORMULA(IF(${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastDataRow}="", "", IF((TODAY()-${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastDataRow})>=1460, "4 Years+", IF((TODAY()-${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastDataRow})>=1095, "3 Years", IF((TODAY()-${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastDataRow})>=730, "2 Years", IF((TODAY()-${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastDataRow})>=545, "1.5 Years", IF((TODAY()-${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastDataRow})>=365, "1 Year", IF((TODAY()-${startDateColLetter}${firstDataRow}:${startDateColLetter}${lastDataRow})>=180, "6 Months", "Less than 6 Months"))))))))`;
        sheet.getRange(firstDataRow, tenureCol).setFormula(arrayFormula);
      }
    }
    
    Logger.log(`Successfully imported ${sheetName}`);
  } catch (error) {
    Logger.log(`Error in importBobDataSimpleWithLookup: ${error.message}`);
    SpreadsheetApp.getUi().alert(`Error importing Base Data: ${error.message}`);
    throw error;
  }
}

/**
 * Imports bonus history from Bob API, keeping only the latest entry per employee
 */
function importBobBonusHistoryLatest() {
  try {
    const reportId = BOB_REPORT_IDS.BONUS_HISTORY;
    const targetSheetName = SHEET_NAMES.BONUS_HISTORY;
    
    Logger.log(`Starting import of ${targetSheetName}...`);
    const rows = fetchBobReport(reportId);
    const header = rows[0];
    const normalizedHeader = normalizeHeader(header);
    
    const iEmpId = findColCached(normalizedHeader, header, ["Employee ID", "Emp ID", "Employee Id"]);
    const iName = findColCached(normalizedHeader, header, ["Display name", "Emp Name", "Display Name", "Name"]);
    const iEffDate = findColCached(normalizedHeader, header, ["Effective date", "Effective Date", "Effective"]);
    const iType = findColCached(normalizedHeader, header, ["Variable type", "Variable Type", "Type"]);
    const iPct = findColCached(normalizedHeader, header, ["Commission/Bonus %", "Variable %", "Commission %", "Bonus %"]);
    const iAmt = findColCached(normalizedHeader, header, ["Amount", "Variable Amount", "Commission/Bonus Amount"]);
    const iCurr = findColOptionalCached(normalizedHeader, header, [
      "Variable Amount currency", "Variable Amount Currency",
      "Amount currency", "Amount Currency", "Currency", "Currency code", "Currency Code"
    ]);
  
    const latest = new Map();
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      
      let empId = safeCell(row, iEmpId);
      const empIdNum = toNumberSafe(empId);
      empId = isFinite(empIdNum) ? String(empIdNum) : empId.trim();
      
      const effRaw = safeCell(row, iEffDate);
      const effKey = (effRaw.match(/^\d{4}-\d{2}-\d{2}/) || [])[0];
      
      if (!empId || !effKey) continue;
      
      const existing = latest.get(empId);
      if (!existing || effKey > existing.effKey) {
        latest.set(empId, { row, effKey });
      }
    }
  
    const outHeader = ["Employee ID", "Display name", "Effective date", "Variable type", "Commission/Bonus %", "Amount", "Amount currency"];
    const out = [outHeader];
  
    latest.forEach(({ row, effKey }) => {
      let empId = safeCell(row, iEmpId);
      const empIdNum = toNumberSafe(empId);
      empId = isFinite(empIdNum) ? String(empIdNum) : empId.trim();
      const name = safeCell(row, iName);
      const type = safeCell(row, iType);
      const pctVal = toNumberSafe(safeCell(row, iPct));
      const amtVal = toNumberSafe(safeCell(row, iAmt));
      const curr = iCurr === -1 ? "" : safeCell(row, iCurr);
      out.push([empId, name, effKey, type, isFinite(pctVal) ? pctVal : "", isFinite(amtVal) ? amtVal : "", curr]);
    });
  
    writeToSheet(targetSheetName, out, [
      { range: [2, 3], format: "@" },
      { range: [2, 5], format: "0.########" },
      { range: [2, 6], format: "#,##0.00" }
    ]);
    
    Logger.log(`Successfully imported ${targetSheetName}`);
  } catch (error) {
    Logger.log(`Error in importBobBonusHistoryLatest: ${error.message}`);
    SpreadsheetApp.getUi().alert(`Error importing Bonus History: ${error.message}`);
    throw error;
  }
}

/**
 * Imports compensation history from Bob API, keeping only the latest entry per employee
 */
function importBobCompHistoryLatest() {
  try {
    const reportId = BOB_REPORT_IDS.COMP_HISTORY;
    const targetSheetName = SHEET_NAMES.COMP_HISTORY;
    
    Logger.log(`Starting import of ${targetSheetName}...`);
    const rows = fetchBobReport(reportId);
    const header = rows[0];
    const normalizedHeader = normalizeHeader(header);
    
    const iEmpId = findColCached(normalizedHeader, header, ["Emp ID", "Employee ID", "Employee Id"]);
    const iName = findColCached(normalizedHeader, header, ["Emp Name", "Display name", "Display Name", "Name"]);
    const iEffDate = findColCached(normalizedHeader, header, ["History effective date", "Effective date", "Effective Date", "Effective"]);
    const iBase = findColCached(normalizedHeader, header, ["History base salary", "Base salary", "Base Salary", "Base pay", "Salary"]);
    const iCurr = findColCached(normalizedHeader, header, ["History base salary currency", "Base salary currency", "Currency"]);
    const iReason = findColCached(normalizedHeader, header, ["History reason", "Reason", "Change reason"]);
  
    const latest = new Map();
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      
      let empId = safeCell(row, iEmpId);
      const empIdNum = toNumberSafe(empId);
      empId = isFinite(empIdNum) ? String(empIdNum) : empId.trim();
      
      const effStr = safeCell(row, iEffDate);
      const ymd = toYmd(effStr);
      if (!empId || !ymd) continue;
      
      const existing = latest.get(empId);
      if (!existing || ymd > existing.ymd) latest.set(empId, { row, ymd });
    }
  
    const outHeader = ["Emp ID", "Emp Name", "Effective date", "Base salary", "Base salary currency", "History reason"];
    const out = [outHeader];
  
    latest.forEach(({ row, ymd }) => {
      let empId = safeCell(row, iEmpId);
      const empIdNum = toNumberSafe(empId);
      empId = isFinite(empIdNum) ? String(empIdNum) : empId.trim();
      const name = safeCell(row, iName);
      const base = toNumberSafe(safeCell(row, iBase));
      const curr = safeCell(row, iCurr);
      const reason = safeCell(row, iReason);
      const effDate = parseDateSmart(ymd);
      out.push([empId, name, effDate, isFinite(base) ? base : "", curr, reason]);
    });
  
    writeToSheet(targetSheetName, out, [
      { range: [2, 3], format: "yyyy-mm-dd" },
      { range: [2, 4], format: "#,##0.00" }
    ]);
    
    Logger.log(`Successfully imported ${targetSheetName}`);
  } catch (error) {
    Logger.log(`Error in importBobCompHistoryLatest: ${error.message}`);
    SpreadsheetApp.getUi().alert(`Error importing Comp History: ${error.message}`);
    throw error;
  }
}

/**
 * Imports full compensation history from Bob API
 */
function importBobFullCompHistory() {
  try {
    const reportId = BOB_REPORT_IDS.FULL_COMP_HISTORY;
    const targetSheetName = SHEET_NAMES.FULL_COMP_HISTORY;
    
    Logger.log(`Starting import of ${targetSheetName}...`);
    const rows = fetchBobReport(reportId);
    const header = rows[0];
    const normalizedHeader = normalizeHeader(header);
    
    const iEmpId = findColCached(normalizedHeader, header, ["Emp ID", "Employee ID", "Employee Id"]);
    const iName = findColCached(normalizedHeader, header, ["Emp Name", "Display name", "Display Name", "Name"]);
    const iEffDate = findColCached(normalizedHeader, header, ["History effective date", "Effective date", "Effective Date", "Effective"]);
    const iBase = findColCached(normalizedHeader, header, ["History base salary", "Base salary", "Base Salary", "Base pay", "Salary"]);
    const iCurr = findColCached(normalizedHeader, header, ["History base salary currency", "Base salary currency", "Currency"]);
    const iReason = findColCached(normalizedHeader, header, ["History reason", "Reason", "Change reason"]);
    
    const employees = new Map();
    const compHistory = new Map();
    const promotions = new Map();
    
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      
      let empId = safeCell(row, iEmpId);
      const empIdNum = toNumberSafe(empId);
      empId = isFinite(empIdNum) ? String(empIdNum) : empId.trim();
      
      if (!empId) continue;
      
      const name = safeCell(row, iName);
      if (!employees.has(empId)) {
        employees.set(empId, { name: name || "" });
      }
      
      const effStr = safeCell(row, iEffDate);
      const ymd = toYmd(effStr);
      const base = toNumberSafe(safeCell(row, iBase));
      const currency = safeCell(row, iCurr);
      const reason = safeCell(row, iReason);
      
      if (!ymd) continue;
      
      if (!compHistory.has(empId)) {
        compHistory.set(empId, []);
      }
      compHistory.get(empId).push({ row, ymd, base, currency, reason });
      
      const reasonLower = reason.toLowerCase();
      if (reasonLower.includes("promotion")) {
        const existing = promotions.get(empId);
        if (!existing || ymd > existing.ymd) {
          promotions.set(empId, { row, ymd });
        }
      }
    }
    
    compHistory.forEach((entries) => {
      entries.sort((a, b) => {
        if (b.ymd > a.ymd) return 1;
        if (b.ymd < a.ymd) return -1;
        return 0;
      });
    });
    
    const outHeader = ["Emp ID", "Emp Name", "Last Promotion Date", "Last Increase %", "Change Reason"];
    const out = [outHeader];
    
    employees.forEach((employee, empId) => {
      const promotion = promotions.get(empId);
      let promotionDate = "";
      
      if (promotion) {
        const effStr = safeCell(promotion.row, iEffDate);
        const ymd = toYmd(effStr);
        if (ymd) promotionDate = parseDateSmart(ymd);
      }
      
      let lastIncreasePct = "", changeReason = "";
      const history = compHistory.get(empId);
      
      if (history && history.length >= 2) {
        const lastEntry = history[0];
        const previousEntry = history[1];
        const lastBase = lastEntry.base;
        const prevBase = previousEntry.base;
        const lastCurrency = (lastEntry.currency || "").trim();
        const prevCurrency = (previousEntry.currency || "").trim();
        
        if (isFinite(lastBase) && isFinite(prevBase) && prevBase > 0 && 
            lastCurrency && prevCurrency && lastCurrency === prevCurrency) {
          const increasePct = ((lastBase - prevBase) / prevBase) * 100;
          if (increasePct >= 0) {
            lastIncreasePct = increasePct.toFixed(2);
            changeReason = lastEntry.reason || "";
          }
        }
      }
      
      out.push([empId, employee.name, promotionDate, lastIncreasePct, changeReason]);
    });
    
    writeToSheet(targetSheetName, out, [
      { range: [2, 3], format: "yyyy-mm-dd" },
      { range: [2, 4], format: "0.00" }
    ]);
    
    Logger.log(`Successfully imported ${targetSheetName} - ${out.length - 1} employees, ${promotions.size} with promotion dates`);
  } catch (error) {
    Logger.log(`Error in importBobFullCompHistory: ${error.message}`);
    SpreadsheetApp.getUi().alert(`Error importing Full Comp History: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// PERFORMANCE REPORT FUNCTIONS
// ============================================================================

/**
 * Prompts user to set HiBob login credentials
 */
function setHiBobCredentials() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  
  const emailResponse = ui.prompt('Set HiBob Email', 'Enter your HiBob email address:', ui.ButtonSet.OK_CANCEL);
  if (emailResponse.getSelectedButton() !== ui.Button.OK) return;
  
  const email = emailResponse.getResponseText().trim();
  if (!email) {
    ui.alert('Error', 'Email cannot be empty.', ui.ButtonSet.OK);
    return;
  }
  
  const passwordResponse = ui.prompt('Set HiBob Password', 'Enter your JumpCloud password:', ui.ButtonSet.OK_CANCEL);
  if (passwordResponse.getSelectedButton() !== ui.Button.OK) return;
  
  const password = passwordResponse.getResponseText().trim();
  if (!password) {
    ui.alert('Error', 'Password cannot be empty.', ui.ButtonSet.OK);
    return;
  }
  
  props.setProperty('HIBOB_EMAIL', email);
  props.setProperty('HIBOB_PASSWORD', password);
  
  ui.alert('Success', 'Credentials saved successfully!\n\nEmail: ' + email, ui.ButtonSet.OK);
  Logger.log('HiBob credentials updated for: ' + email);
}

/**
 * Shows the status of stored credentials
 */
function viewCredentialsStatus() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  
  const email = props.getProperty('HIBOB_EMAIL');
  const hasPassword = props.getProperty('HIBOB_PASSWORD') ? 'Yes' : 'No';
  
  const status = 'HiBob Credentials Status\n\n' +
    'Email: ' + (email || 'Not set') + '\n' +
    'Password: ' + hasPassword + '\n\n' +
    (email ? 'Credentials are ready to use.' : 'Please set credentials using "Set HiBob Credentials" menu item.');
  
  ui.alert('Credentials Status', status, ui.ButtonSet.OK);
}

/**
 * Gets stored HiBob credentials
 */
function getHiBobCredentials() {
  const props = PropertiesService.getScriptProperties();
  const email = props.getProperty('HIBOB_EMAIL');
  const password = props.getProperty('HIBOB_PASSWORD');
  
  if (!email || !password) return null;
  return { email, password };
}

/**
 * Triggers a message about downloading performance report
 */
function triggerPerformanceReportDownload() {
  const ui = SpreadsheetApp.getUi();
  const creds = getHiBobCredentials();
  const hasCreds = creds ? 'Yes' : 'No';
  
  const message = 'Performance Report Download\n\n' +
    'Credentials stored: ' + hasCreds + '\n\n' +
    'To download a report:\n' +
    '1. Open terminal on your local machine\n' +
    '2. Navigate to project directory\n' +
    '3. Run: python3 hibob_report_downloader.py\n' +
    '4. Enter the report name when prompted\n\n' +
    (creds ? 
      '✅ Credentials are stored and ready to use.\nThe Python script can fetch them automatically.' :
      '⚠️ Please set credentials first using "Set HiBob Credentials"');
  
  ui.alert('Download Performance Report', message, ui.ButtonSet.OK);
}

/**
 * Launches the web interface for Performance Report automation
 * Opens a dialog with instructions and a link to the web interface
 */
function launchWebInterface() {
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <base target="_top">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 20px;
          max-width: 600px;
          margin: 0 auto;
        }
        h2 {
          color: #667eea;
          margin-top: 0;
        }
        .step {
          background: #f8f9fa;
          padding: 15px;
          margin: 10px 0;
          border-radius: 8px;
          border-left: 4px solid #667eea;
        }
        .step-number {
          font-weight: bold;
          color: #667eea;
        }
        .code {
          background: #2d2d2d;
          color: #f8f8f2;
          padding: 10px;
          border-radius: 5px;
          font-family: 'Courier New', monospace;
          margin: 10px 0;
          overflow-x: auto;
        }
        .button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          margin: 10px 5px;
          transition: transform 0.2s;
        }
        .button:hover {
          transform: translateY(-2px);
        }
        .button-secondary {
          background: #6c757d;
        }
        .warning {
          background: #fff3cd;
          border-left-color: #ffc107;
          padding: 10px;
          border-radius: 5px;
          margin: 10px 0;
        }
        .success {
          background: #d4edda;
          border-left-color: #28a745;
          padding: 10px;
          border-radius: 5px;
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <h2>🚀 Launch Web Interface</h2>
      
      <div class="step">
        <span class="step-number">Step 1:</span> Start the web server on your local machine
        <div class="code">./start_web_app.sh</div>
        <p style="font-size: 12px; color: #666; margin-top: 5px;">
          Or on Windows: <code>start_web_app.bat</code>
        </p>
      </div>
      
      <div class="warning">
        ⚠️ <strong>Important:</strong> The web interface runs on your local machine (localhost). 
        Make sure the server is running before clicking the button below.
      </div>
      
      <div class="step">
        <span class="step-number">Step 2:</span> Open the web interface
        <br><br>
        <a href="http://localhost:5000" target="_blank" class="button">
          🌐 Open Web Interface
        </a>
        <a href="http://127.0.0.1:5000" target="_blank" class="button button-secondary">
          🔗 Alternative URL
        </a>
      </div>
      
      <div class="success">
        ✅ <strong>Features:</strong>
        <ul style="margin: 5px 0; padding-left: 20px;">
          <li>Visual progress tracking</li>
          <li>Checkbox selection for reports</li>
          <li>Real-time status updates</li>
          <li>No terminal interaction needed</li>
        </ul>
      </div>
      
      <div class="step">
        <strong>Default Port:</strong> 5000<br>
        <strong>Custom Port:</strong> Run <code>./start_web_app.sh 8080</code> to use port 8080
      </div>
      
      <p style="text-align: center; margin-top: 20px;">
        <button onclick="google.script.host.close()" class="button button-secondary">
          Close
        </button>
      </p>
    </body>
    </html>
  `)
    .setWidth(650)
    .setHeight(600);
  
  SpreadsheetApp.getUi().showModalDialog(html, 'Launch Web Interface');
}

/**
 * Shows instructions for using the Performance Report automation
 */
function showPerformanceReportInstructions() {
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <base target="_top">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 20px;
          max-width: 700px;
          margin: 0 auto;
          line-height: 1.6;
        }
        h2 {
          color: #667eea;
          margin-top: 0;
          border-bottom: 2px solid #667eea;
          padding-bottom: 10px;
        }
        h3 {
          color: #764ba2;
          margin-top: 20px;
        }
        .method {
          background: #f8f9fa;
          padding: 15px;
          margin: 15px 0;
          border-radius: 8px;
          border-left: 4px solid #667eea;
        }
        .method.recommended {
          border-left-color: #28a745;
          background: #d4edda;
        }
        .method-title {
          font-weight: bold;
          font-size: 18px;
          margin-bottom: 10px;
        }
        .method.recommended .method-title::before {
          content: "⭐ ";
        }
        .step {
          margin: 8px 0;
          padding-left: 20px;
        }
        .code {
          background: #2d2d2d;
          color: #f8f8f2;
          padding: 10px;
          border-radius: 5px;
          font-family: 'Courier New', monospace;
          margin: 10px 0;
          overflow-x: auto;
          font-size: 14px;
        }
        .info-box {
          background: #e3f2fd;
          border-left: 4px solid #2196f3;
          padding: 12px;
          margin: 15px 0;
          border-radius: 5px;
        }
        .button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 10px;
        }
        .button:hover {
          transform: translateY(-2px);
        }
        ul {
          margin: 10px 0;
          padding-left: 25px;
        }
        li {
          margin: 5px 0;
        }
      </style>
    </head>
    <body>
      <h2>📖 HiBob Performance Report Automation</h2>
      
      <div class="info-box">
        <strong>Purpose:</strong> Download performance reports from HiBob (no API available) 
        and automatically upload them to Google Sheets for performance cycle reporting.
      </div>
      
      <div class="method recommended">
        <div class="method-title">Method 1: Web Interface (Recommended)</div>
        <div class="step">1. Click <strong>"🚀 Launch Web Interface"</strong> from the menu</div>
        <div class="step">2. Start the web server on your local machine:</div>
        <div class="code">./start_web_app.sh</div>
        <div class="step">3. Click the button in the dialog to open the web interface</div>
        <div class="step">4. Enter report name and click "Start Automation"</div>
        <div class="step">5. Select report using checkboxes and watch progress</div>
        
        <strong>Features:</strong>
        <ul>
          <li>✅ Visual progress tracking with progress bar</li>
          <li>✅ Checkbox selection for reports</li>
          <li>✅ Real-time status updates</li>
          <li>✅ Runs in background (no popup windows)</li>
          <li>✅ No terminal interaction needed</li>
        </ul>
      </div>
      
      <div class="method">
        <div class="method-title">Method 2: Terminal (Alternative)</div>
        <div class="step">1. Set credentials: <strong>"Set HiBob Credentials"</strong> from menu</div>
        <div class="step">2. Open terminal and navigate to project directory</div>
        <div class="step">3. Run:</div>
        <div class="code">python3 hibob_report_downloader.py</div>
        <div class="step">4. Enter report name when prompted</div>
      </div>
      
      <h3>🔐 Credentials Setup</h3>
      <div class="info-box">
        <strong>Option 1:</strong> Store in Apps Script (Recommended)
        <ul>
          <li>Click "Set HiBob Credentials" from menu</li>
          <li>Enter your HiBob email and password</li>
          <li>Credentials are stored securely in Apps Script</li>
          <li>Python script can fetch them automatically</li>
        </ul>
        
        <strong>Option 2:</strong> Use config.json file
        <ul>
          <li>Edit <code>config.json</code> with your credentials</li>
          <li>File is gitignored (not committed to repository)</li>
        </ul>
      </div>
      
      <h3>📋 How It Works</h3>
      <ol>
        <li>Automation logs into HiBob via JumpCloud SSO</li>
        <li>Navigates to Performance Cycles page</li>
        <li>Searches for the specified report</li>
        <li>Downloads the Excel report</li>
        <li>Reads the Excel file content</li>
        <li>Uploads data to "Bob Perf Report" sheet in Google Sheets</li>
        <li>Formats the header row (blue background, bold text)</li>
      </ol>
      
      <h3>⚙️ Local Setup (First Time Only)</h3>
      <div class="code">
# Install Python dependencies<br>
pip3 install -r requirements.txt<br><br>
# Install Playwright browser<br>
playwright install chromium<br><br>
# For web interface, use the startup script:<br>
./start_web_app.sh
      </div>
      
      <h3>🔗 Google Sheets Integration</h3>
      <div class="info-box">
        Reports are automatically uploaded to:<br>
        <strong>Sheet:</strong> "Bob Perf Report"<br>
        <strong>Sheet ID:</strong> 1rnpUlOcqTpny2Pve2L82qWGI9WplOetx-1Wba7ONoeA<br><br>
        Uses Google Sheets API with service account for seamless automation.
      </div>
      
      <p style="text-align: center; margin-top: 30px;">
        <button onclick="google.script.host.close()" class="button">
          Close
        </button>
      </p>
    </body>
    </html>
  `)
    .setWidth(750)
    .setHeight(700);
  
  SpreadsheetApp.getUi().showModalDialog(html, 'Performance Report Instructions');
}

// ============================================================================
// FIELD UPLOADER FUNCTIONS
// ============================================================================

/**
 * Pulls all available fields from Bob API and stores in metadata sheet
 */
function pullFields() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Pulling Fields', 'This will fetch all available fields from Bob API. This may take a few minutes...', ui.ButtonSet.OK);
    
    Logger.log('Starting to pull fields from Bob API...');
    const fields = fetchBobFields();
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.BOB_FIELDS_META) || ss.insertSheet(SHEET_NAMES.BOB_FIELDS_META);
    
    sheet.clear();
    const header = ['Field ID', 'Field Name', 'Field Type', 'Category'];
    const data = [header];
    
    fields.forEach(field => {
      data.push([
        field.id || '',
        field.name || '',
        field.type || '',
        field.category || ''
      ]);
    });
    
    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    sheet.getRange(1, 1, 1, data[0].length).setFontWeight('bold');
    sheet.autoResizeColumns(1, data[0].length);
    
    Logger.log(`Successfully pulled ${fields.length} fields`);
    ui.alert('Success', `Successfully pulled ${fields.length} fields from Bob API!`, ui.ButtonSet.OK);
  } catch (error) {
    Logger.log(`Error in pullFields: ${error.message}`);
    SpreadsheetApp.getUi().alert('Error', `Failed to pull fields: ${error.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}

/**
 * Pulls all available lists from Bob API
 */
function pullLists() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Pulling Lists', 'This will fetch all available lists from Bob API...', ui.ButtonSet.OK);
    
    Logger.log('Starting to pull lists from Bob API...');
    const lists = fetchBobLists();
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.BOB_LISTS) || ss.insertSheet(SHEET_NAMES.BOB_LISTS);
    
    sheet.clear();
    const header = ['List ID', 'List Name', 'Values'];
    const data = [header];
    
    lists.forEach(list => {
      const values = Array.isArray(list.values) ? list.values.join(', ') : '';
      data.push([
        list.id || '',
        list.name || '',
        values
      ]);
    });
    
    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    sheet.getRange(1, 1, 1, data[0].length).setFontWeight('bold');
    sheet.autoResizeColumns(1, data[0].length);
    
    Logger.log(`Successfully pulled ${lists.length} lists`);
    ui.alert('Success', `Successfully pulled ${lists.length} lists from Bob API!`, ui.ButtonSet.OK);
  } catch (error) {
    Logger.log(`Error in pullLists: ${error.message}`);
    SpreadsheetApp.getUi().alert('Error', `Failed to pull lists: ${error.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}

/**
 * Pulls employee data and stores in Employees sheet
 */
function pullEmployees() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Pulling Employees', 'This will fetch employee data from Bob API. This may take a few minutes...', ui.ButtonSet.OK);
    
    Logger.log('Starting to pull employees from Bob API...');
    const rows = fetchBobReport(BOB_REPORT_IDS.BASE_DATA);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.EMPLOYEES) || ss.insertSheet(SHEET_NAMES.EMPLOYEES);
    
    sheet.clear();
    const dataRange = sheet.getRange(1, 1, rows.length, rows[0].length);
    dataRange.setValues(rows);
    sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
    sheet.autoResizeColumns(1, rows[0].length);
    
    Logger.log(`Successfully pulled ${rows.length - 1} employees`);
    ui.alert('Success', `Successfully pulled ${rows.length - 1} employees from Bob API!`, ui.ButtonSet.OK);
  } catch (error) {
    Logger.log(`Error in pullEmployees: ${error.message}`);
    SpreadsheetApp.getUi().alert('Error', `Failed to pull employees: ${error.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}

/**
 * Refreshes employee data while keeping existing filters
 */
function refreshEmployeesKeepFilters() {
  try {
    pullEmployees();
    SpreadsheetApp.getUi().alert('Success', 'Employee data refreshed while keeping filters!', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (error) {
    Logger.log(`Error in refreshEmployeesKeepFilters: ${error.message}`);
    SpreadsheetApp.getUi().alert('Error', `Failed to refresh employees: ${error.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}

/**
 * Sets up the Field Uploader sheet with instructions
 */
function setupFieldUploader() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.UPLOADER) || ss.insertSheet(SHEET_NAMES.UPLOADER);
    
    // Clear existing content
    sheet.clear();
    
    // Set up header and instructions
    const instructions = [
      ['Field Uploader - Update Single Field for Multiple Employees'],
      [''],
      ['1. Click "SETUP -> 5. Select Field to Update" to choose which field to update'],
      ['2. Paste employee CIQ IDs in column A below (starting row 8)'],
      ['3. Enter new values in column B'],
      ['4. Validate with "VALIDATE -> Validate Field Upload Data"'],
      [''],
      ['CIQ ID', 'New Value']
    ];
    
    sheet.getRange(1, 1, instructions.length, 2).setValues(instructions);
    
    // Format header
    sheet.getRange(1, 1, 1, 2).setBackground('#4285f4').setFontColor('#ffffff').setFontWeight('bold');
    sheet.getRange(7, 1, 1, 2).setBackground('#f0f0f0').setFontWeight('bold');
    
    // Set column widths
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 300);
    
    // Freeze header rows
    sheet.setFrozenRows(7);
    
    Logger.log('Field Uploader sheet setup complete');
    SpreadsheetApp.getUi().alert('Success', 'Field Uploader sheet has been set up!', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (error) {
    Logger.log(`Error in setupFieldUploader: ${error.message}`);
    SpreadsheetApp.getUi().alert('Error', `Failed to setup Field Uploader: ${error.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}

/**
 * Shows modal dialog to select field to update with working search functionality
 * 
 * Features:
 * - Real-time search filtering across field name, type, category, and ID
 * - Click to select field
 * - Visual feedback for selected field
 * - Displays field metadata (type, category)
 * 
 * @requires Sheet "Bob Fields Meta Data" to exist (created by pullFields)
 * @throws {Error} If fields sheet not found or empty
 */
function selectFieldToUpdate() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const fieldsSheet = ss.getSheetByName(SHEET_NAMES.BOB_FIELDS_META);
    
    if (!fieldsSheet) {
      SpreadsheetApp.getUi().alert('Error', 'Please run "SETUP -> 1. Pull Fields" first to load available fields.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    const data = fieldsSheet.getDataRange().getValues();
    if (data.length <= 1) {
      SpreadsheetApp.getUi().alert('Error', 'No fields found. Please run "SETUP -> 1. Pull Fields" first.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    // Extract fields (skip header row)
    const fields = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][1]) { // Field Name column
        fields.push({
          id: data[i][0] || '',
          name: data[i][1] || '',
          type: data[i][2] || '',
          category: data[i][3] || ''
        });
      }
    }
    
    const html = HtmlService.createHtmlOutput(`
      <!DOCTYPE html>
      <html>
      <head>
        <base target="_top">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            margin: 0;
          }
          h2 {
            margin-top: 0;
            color: #333;
            font-size: 18px;
          }
          .subtitle {
            color: #666;
            font-size: 14px;
            margin-bottom: 15px;
          }
          .search-container {
            margin-bottom: 15px;
          }
          #searchInput {
            width: 100%;
            padding: 10px;
            font-size: 14px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
          }
          .field-count {
            color: #666;
            font-size: 12px;
            margin-top: 5px;
          }
          .fields-list {
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 5px;
          }
          .field-item {
            padding: 10px;
            border-bottom: 1px solid #eee;
            cursor: pointer;
            transition: background-color 0.2s;
          }
          .field-item:hover {
            background-color: #f5f5f5;
          }
          .field-item.selected {
            background-color: #e3f2fd;
            border-left: 3px solid #2196f3;
          }
          .field-name {
            font-weight: 500;
            color: #333;
            margin-bottom: 3px;
          }
          .field-meta {
            font-size: 12px;
            color: #666;
          }
          .no-results {
            padding: 20px;
            text-align: center;
            color: #999;
          }
          .button-container {
            margin-top: 15px;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
          }
          button {
            padding: 10px 20px;
            font-size: 14px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
          }
          .button-cancel {
            background-color: #f5f5f5;
            color: #333;
          }
          .button-cancel:hover {
            background-color: #e0e0e0;
          }
          .button-select {
            background-color: #2196f3;
            color: white;
          }
          .button-select:hover {
            background-color: #1976d2;
          }
          .button-select:disabled {
            background-color: #ccc;
            cursor: not-allowed;
          }
        </style>
      </head>
      <body>
        <h2>Select Field to Update</h2>
        <div class="subtitle">Search and select which employee field you want to update</div>
        
        <div class="search-container">
          <input type="text" id="searchInput" placeholder="Search fields..." autofocus>
          <div class="field-count" id="fieldCount">${fields.length} fields available</div>
        </div>
        
        <div class="fields-list" id="fieldsList"></div>
        
        <div class="button-container">
          <button class="button-cancel" onclick="cancel()">Cancel</button>
          <button class="button-select" id="selectButton" onclick="selectField()" disabled>Select Field</button>
        </div>
        
        <script>
          const allFields = ${JSON.stringify(fields)};
          let filteredFields = allFields;
          let selectedField = null;
          
          function renderFields() {
            const container = document.getElementById('fieldsList');
            const countEl = document.getElementById('fieldCount');
            const selectBtn = document.getElementById('selectButton');
            
            if (filteredFields.length === 0) {
              container.innerHTML = '<div class="no-results">No fields match your search</div>';
              countEl.textContent = '0 fields found';
              selectBtn.disabled = true;
              return;
            }
            
            countEl.textContent = filteredFields.length + ' field' + (filteredFields.length !== 1 ? 's' : '') + ' available';
            
            container.innerHTML = filteredFields.map((field, index) => {
              const isSelected = selectedField && selectedField.id === field.id;
              const selectedClass = isSelected ? 'selected' : '';
              const fieldName = escapeHtml(field.name);
              const fieldType = field.type ? 'Type: ' + escapeHtml(field.type) : '';
              const fieldCategory = field.category ? ' | Category: ' + escapeHtml(field.category) : '';
              const fieldMeta = fieldType + (fieldCategory ? fieldCategory : '');
              return '<div class="field-item ' + selectedClass + '" onclick="selectFieldItem(' + index + ')" data-field-id="' + field.id + '">' +
                     '<div class="field-name">' + fieldName + '</div>' +
                     '<div class="field-meta">' + fieldMeta + '</div>' +
                     '</div>';
            }).join('');
            
            selectBtn.disabled = !selectedField;
          }
          
          function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
          }
          
          function selectFieldItem(index) {
            selectedField = filteredFields[index];
            renderFields();
          }
          
          function searchFields() {
            const query = document.getElementById('searchInput').value.toLowerCase().trim();
            
            if (!query) {
              filteredFields = allFields;
            } else {
              filteredFields = allFields.filter(field => {
                const name = (field.name || '').toLowerCase();
                const type = (field.type || '').toLowerCase();
                const category = (field.category || '').toLowerCase();
                const id = (field.id || '').toLowerCase();
                
                return name.includes(query) || 
                       type.includes(query) || 
                       category.includes(query) ||
                       id.includes(query);
              });
            }
            
            selectedField = null; // Reset selection when searching
            renderFields();
          }
          
          document.getElementById('searchInput').addEventListener('input', searchFields);
          document.getElementById('searchInput').addEventListener('keyup', function(e) {
            if (e.key === 'Enter' && selectedField && !document.getElementById('selectButton').disabled) {
              selectField();
            }
          });
          
          function selectField() {
            if (selectedField) {
              google.script.run
                .withSuccessHandler(function() {
                  google.script.host.close();
                })
                .withFailureHandler(function(error) {
                  alert('Error: ' + error.message);
                })
                .setSelectedField(selectedField.id, selectedField.name);
            }
          }
          
          function cancel() {
            google.script.host.close();
          }
          
          // Initial render
          renderFields();
        </script>
      </body>
      </html>
    `)
    .setWidth(600)
    .setHeight(600);
    
    SpreadsheetApp.getUi().showModalDialog(html, 'Select Field to Update');
  } catch (error) {
    Logger.log(`Error in selectFieldToUpdate: ${error.message}`);
    SpreadsheetApp.getUi().alert('Error', `Failed to open field selector: ${error.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}

/**
 * Stores the selected field ID and name in script properties
 */
function setSelectedField(fieldId, fieldName) {
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('SELECTED_FIELD_ID', fieldId);
    props.setProperty('SELECTED_FIELD_NAME', fieldName);
    
    // Update the Uploader sheet to show selected field
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.UPLOADER);
    if (sheet) {
      sheet.getRange(1, 1).setValue(`Field Uploader - Update Single Field for Multiple Employees`);
      sheet.getRange(1, 2).setValue(`Selected Field: ${fieldName}`);
      sheet.getRange(1, 2).setFontStyle('italic').setFontColor('#666');
    }
    
    Logger.log(`Selected field: ${fieldName} (ID: ${fieldId})`);
    SpreadsheetApp.getUi().alert('Success', `Field selected: ${fieldName}`, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (error) {
    Logger.log(`Error in setSelectedField: ${error.message}`);
    throw error;
  }
}

/**
 * Validates the field upload data before uploading
 */
function validateFieldUploadData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.UPLOADER);
    
    if (!sheet) {
      SpreadsheetApp.getUi().alert('Error', 'Uploader sheet not found. Please run "SETUP -> 4. Setup Field Uploader" first.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    const props = PropertiesService.getScriptProperties();
    const fieldId = props.getProperty('SELECTED_FIELD_ID');
    const fieldName = props.getProperty('SELECTED_FIELD_NAME');
    
    if (!fieldId || !fieldName) {
      SpreadsheetApp.getUi().alert('Error', 'No field selected. Please run "SETUP -> 5. Select Field to Update" first.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    // Get data from sheet
    const lastRow = sheet.getLastRow();
    if (lastRow < UPLOADER_START_ROW) {
      SpreadsheetApp.getUi().alert('Error', 'No data found. Please add CIQ IDs and values starting from row ' + UPLOADER_START_ROW + '.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    const data = sheet.getRange(UPLOADER_START_ROW, 1, lastRow - UPLOADER_START_ROW + 1, 2).getValues();
    const validRows = [];
    const errors = [];
    
    for (let i = 0; i < data.length; i++) {
      const rowNum = UPLOADER_START_ROW + i;
      const ciqId = String(data[i][0] || '').trim();
      const value = String(data[i][1] || '').trim();
      
      if (!ciqId && !value) continue; // Skip empty rows
      
      if (!ciqId) {
        errors.push(`Row ${rowNum}: Missing CIQ ID`);
        continue;
      }
      
      if (!value) {
        errors.push(`Row ${rowNum}: Missing value`);
        continue;
      }
      
      validRows.push({ ciqId, value, rowNum });
    }
    
    if (validRows.length === 0) {
      SpreadsheetApp.getUi().alert('Error', 'No valid rows found. Please add CIQ IDs and values.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    let message = `Validation Results:\n\n`;
    message += `Selected Field: ${fieldName}\n`;
    message += `Valid Rows: ${validRows.length}\n`;
    
    if (errors.length > 0) {
      message += `Errors: ${errors.length}\n\n`;
      message += `Errors:\n${errors.slice(0, 10).join('\n')}`;
      if (errors.length > 10) {
        message += `\n... and ${errors.length - 10} more errors`;
      }
    }
    
    SpreadsheetApp.getUi().alert('Validation Results', message, SpreadsheetApp.getUi().ButtonSet.OK);
    Logger.log(`Validation: ${validRows.length} valid rows, ${errors.length} errors`);
  } catch (error) {
    Logger.log(`Error in validateFieldUploadData: ${error.message}`);
    SpreadsheetApp.getUi().alert('Error', `Validation failed: ${error.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}

/**
 * Uploads field updates to Bob API
 */
function uploadFieldUpdates() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.UPLOADER);
    
    if (!sheet) {
      SpreadsheetApp.getUi().alert('Error', 'Uploader sheet not found.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    const props = PropertiesService.getScriptProperties();
    const fieldId = props.getProperty('SELECTED_FIELD_ID');
    const fieldName = props.getProperty('SELECTED_FIELD_NAME');
    
    if (!fieldId || !fieldName) {
      SpreadsheetApp.getUi().alert('Error', 'No field selected. Please run "SETUP -> 5. Select Field to Update" first.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    const response = SpreadsheetApp.getUi().alert(
      'Upload Field Updates',
      `This will update the field "${fieldName}" for all employees listed in the Uploader sheet. Continue?`,
      SpreadsheetApp.getUi().ButtonSet.YES_NO
    );
    
    if (response !== SpreadsheetApp.getUi().Button.YES) return;
    
    // Get data from sheet
    const lastRow = sheet.getLastRow();
    if (lastRow < UPLOADER_START_ROW) {
      SpreadsheetApp.getUi().alert('Error', 'No data found.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    const data = sheet.getRange(UPLOADER_START_ROW, 1, lastRow - UPLOADER_START_ROW + 1, 2).getValues();
    const updates = [];
    
    for (let i = 0; i < data.length; i++) {
      const ciqId = String(data[i][0] || '').trim();
      const value = String(data[i][1] || '').trim();
      
      if (!ciqId || !value) continue;
      updates.push({ ciqId, value });
    }
    
    if (updates.length === 0) {
      SpreadsheetApp.getUi().alert('Error', 'No valid updates found.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    Logger.log(`Starting upload of ${updates.length} field updates...`);
    
    // Upload to Bob API
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (const update of updates) {
      try {
        updateEmployeeField(update.ciqId, fieldId, update.value);
        successCount++;
      } catch (error) {
        errorCount++;
        errors.push(`${update.ciqId}: ${error.message}`);
        Logger.log(`Error updating ${update.ciqId}: ${error.message}`);
      }
    }
    
    let message = `Upload Complete:\n\n`;
    message += `Successful: ${successCount}\n`;
    message += `Failed: ${errorCount}\n`;
    
    if (errors.length > 0 && errors.length <= 10) {
      message += `\nErrors:\n${errors.join('\n')}`;
    } else if (errors.length > 10) {
      message += `\nFirst 10 errors:\n${errors.slice(0, 10).join('\n')}`;
    }
    
    SpreadsheetApp.getUi().alert('Upload Complete', message, SpreadsheetApp.getUi().ButtonSet.OK);
    Logger.log(`Upload complete: ${successCount} successful, ${errorCount} failed`);
  } catch (error) {
    Logger.log(`Error in uploadFieldUpdates: ${error.message}`);
    SpreadsheetApp.getUi().alert('Error', `Upload failed: ${error.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}

/**
 * Fetches all available fields from Bob API
 * 
 * @returns {Array<Object>} Array of field objects with id, name, type, and category
 * @throws {Error} If API request fails or credentials are missing
 */
function fetchBobFields() {
  try {
    const apiUrl = 'https://api.hibob.com/v1/fields';
    const creds = getBobCredentials();
    const basicAuth = Utilities.base64Encode(`${creds.id}:${creds.key}`);
    
    const res = UrlFetchApp.fetch(apiUrl, {
      method: 'get',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${basicAuth}`
      },
      muteHttpExceptions: true
    });
    
    if (res.getResponseCode() !== 200) {
      throw new Error(`Failed to fetch fields: ${res.getResponseCode()} - ${res.getContentText()}`);
    }
    
    const response = JSON.parse(res.getContentText());
    return response.fields || [];
  } catch (error) {
    Logger.log(`Error in fetchBobFields: ${error.message}`);
    throw error;
  }
}

/**
 * Fetches all available lists from Bob API
 * 
 * @returns {Array<Object>} Array of list objects with id, name, and values
 * @throws {Error} If API request fails or credentials are missing
 */
function fetchBobLists() {
  try {
    const apiUrl = 'https://api.hibob.com/v1/fields/list';
    const creds = getBobCredentials();
    const basicAuth = Utilities.base64Encode(`${creds.id}:${creds.key}`);
    
    const res = UrlFetchApp.fetch(apiUrl, {
      method: 'get',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${basicAuth}`
      },
      muteHttpExceptions: true
    });
    
    if (res.getResponseCode() !== 200) {
      throw new Error(`Failed to fetch lists: ${res.getResponseCode()} - ${res.getContentText()}`);
    }
    
    const response = JSON.parse(res.getContentText());
    return response.lists || [];
  } catch (error) {
    Logger.log(`Error in fetchBobLists: ${error.message}`);
    throw error;
  }
}

/**
 * Updates a specific field for an employee via Bob API
 * 
 * @param {string} ciqId - Employee CIQ ID (unique identifier)
 * @param {string} fieldId - Field ID to update
 * @param {string|number} value - New value for the field
 * @returns {boolean} True if update successful
 * @throws {Error} If API request fails or employee/field not found
 */
function updateEmployeeField(ciqId, fieldId, value) {
  try {
    const apiUrl = `https://api.hibob.com/v1/people/${ciqId}/fields/${fieldId}`;
    const creds = getBobCredentials();
    const basicAuth = Utilities.base64Encode(`${creds.id}:${creds.key}`);
    
    const payload = {
      value: value
    };
    
    const res = UrlFetchApp.fetch(apiUrl, {
      method: 'put',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${basicAuth}`
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    if (res.getResponseCode() !== 200 && res.getResponseCode() !== 204) {
      throw new Error(`Failed to update field: ${res.getResponseCode()} - ${res.getContentText()}`);
    }
    
    return true;
  } catch (error) {
    Logger.log(`Error in updateEmployeeField: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// WEB APP HANDLERS (doGet, doPost)
// ============================================================================

/**
 * Handle GET requests (for credentials API)
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'getCredentials') {
      return getCredentialsAPI(e);
    }
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Invalid action'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('Error in doGet: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle POST requests from the Python automation
 */
function doPost(e) {
  try {
    Logger.log('Received POST request');
    
    if (!e || !e.postData) {
      return createResponse(400, 'No data received');
    }
    
    // Check if it's JSON data (new method) or multipart file (old method)
    const contentType = e.postData.type || '';
    
    if (contentType.includes('application/json')) {
      // New method: JSON data with Excel content
      try {
        const jsonData = JSON.parse(e.postData.contents);
        
        if (!jsonData.data || !Array.isArray(jsonData.data)) {
          Logger.log('Invalid JSON data structure');
          return createResponse(400, 'Invalid JSON data. Expected "data" array.');
        }
        
        const sheetName = jsonData.sheet_name || SHEET_NAMES.PERF_REPORT;
        const filename = jsonData.filename || 'report.xlsx';
        
        Logger.log('JSON data received: ' + jsonData.data.length + ' rows, filename: ' + filename);
        
        // Check if data is too large
        if (jsonData.data.length > 100000) {
          Logger.log('Warning: Very large dataset: ' + jsonData.data.length + ' rows');
        }
        
        const result = importDataToSheet(jsonData.data, sheetName);
        
        if (result.success) {
          return createResponse(200, result.message, {
            rowsImported: result.rowsImported,
            sheetName: sheetName,
            sheetId: PERF_SHEET_ID
          });
        } else {
          Logger.log('Import failed: ' + result.message);
          return createResponse(500, result.message);
        }
      } catch (parseError) {
        Logger.log('JSON parse error: ' + parseError.toString());
        Logger.log('Content type: ' + contentType);
        Logger.log('Content length: ' + (e.postData.contents ? e.postData.contents.length : 0));
        return createResponse(400, 'Failed to parse JSON: ' + parseError.toString());
      }
    } else {
      // Old method: multipart file upload (for backward compatibility)
      const boundary = extractBoundary(contentType);
      if (!boundary) {
        return createResponse(400, 'Invalid content type. Expected application/json or multipart/form-data');
      }
      
      const fileData = extractFileFromMultipart(e.postData.contents, boundary);
      if (!fileData) {
        return createResponse(400, 'No file found in request');
      }
      
      Logger.log('File received: ' + fileData.filename);
      const result = importFileToSheet(fileData);
      
      if (result.success) {
        return createResponse(200, result.message, {
          rowsImported: result.rowsImported,
          sheetName: SHEET_NAMES.PERF_REPORT,
          sheetId: PERF_SHEET_ID
        });
      } else {
        return createResponse(500, result.message);
      }
    }
  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return createResponse(500, 'Internal error: ' + error.toString());
  }
}

/**
 * API endpoint to get credentials (called by Python script)
 */
function getCredentialsAPI(e) {
  try {
    const creds = getHiBobCredentials();
    
    if (!creds) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Credentials not set. Please use "Set HiBob Credentials" menu item in Google Sheets.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      email: creds.email,
      password: creds.password
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('Error in getCredentialsAPI: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Import data array directly to Google Sheet (for Performance Reports)
 * This is the new method that receives parsed Excel data as JSON
 */
function importDataToSheet(data, sheetName) {
  try {
    const spreadsheet = SpreadsheetApp.openById(PERF_SHEET_ID);
    let sheet = spreadsheet.getSheetByName(sheetName);
    
    if (sheet) {
      sheet.clear();
      Logger.log('Cleared existing sheet: ' + sheetName);
    } else {
      sheet = spreadsheet.insertSheet(sheetName);
      Logger.log('Created new sheet: ' + sheetName);
    }
    
    if (!data || data.length === 0) {
      return {
        success: false,
        message: 'No data provided'
      };
    }
    
    const numRows = data.length;
    const numCols = data[0].length;
    
    // Write data to sheet
    sheet.getRange(1, 1, numRows, numCols).setValues(data);
    
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, numCols);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    
    // Auto-resize columns
    for (let i = 1; i <= numCols; i++) {
      sheet.autoResizeColumn(i);
    }
    
    // Freeze header row
    sheet.setFrozenRows(1);
    
    Logger.log('Successfully imported ' + numRows + ' rows to ' + sheetName);
    
    return {
      success: true,
      message: 'Successfully imported report to Google Sheet',
      rowsImported: numRows
    };
  } catch (error) {
    Logger.log('Error importing to sheet: ' + error.toString());
    return {
      success: false,
      message: 'Error importing to sheet: ' + error.toString()
    };
  }
}

/**
 * Import file to Google Sheet (for Performance Reports)
 * This is the old method for backward compatibility with CSV files
 */
function importFileToSheet(fileData) {
  try {
    const spreadsheet = SpreadsheetApp.openById(PERF_SHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAMES.PERF_REPORT);
    
    if (sheet) {
      sheet.clear();
      Logger.log('Cleared existing sheet: ' + SHEET_NAMES.PERF_REPORT);
    } else {
      sheet = spreadsheet.insertSheet(SHEET_NAMES.PERF_REPORT);
      Logger.log('Created new sheet: ' + SHEET_NAMES.PERF_REPORT);
    }
    
    let data = [];
    const filename = fileData.filename.toLowerCase();
    
    if (filename.endsWith('.csv')) {
      data = parseCSV(fileData.content);
    } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      return {
        success: false,
        message: 'Excel file format not yet supported. Please download as CSV format.'
      };
    } else {
      data = parseCSV(fileData.content);
    }
    
    if (!data || data.length === 0) {
      return {
        success: false,
        message: 'No data found in file or unable to parse file format'
      };
    }
    
    const numRows = data.length;
    const numCols = data[0].length;
    
    sheet.getRange(1, 1, numRows, numCols).setValues(data);
    
    const headerRange = sheet.getRange(1, 1, 1, numCols);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    
    for (let i = 1; i <= numCols; i++) {
      sheet.autoResizeColumn(i);
    }
    
    sheet.setFrozenRows(1);
    
    Logger.log('Successfully imported ' + numRows + ' rows to ' + SHEET_NAMES.PERF_REPORT);
    
    return {
      success: true,
      message: 'Successfully imported report to Google Sheet',
      rowsImported: numRows
    };
  } catch (error) {
    Logger.log('Error importing to sheet: ' + error.toString());
    return {
      success: false,
      message: 'Error importing to sheet: ' + error.toString()
    };
  }
}

/**
 * Extract boundary from content type
 */
function extractBoundary(contentType) {
  const match = contentType.match(/boundary=([^;]+)/);
  return match ? match[1].trim() : null;
}

/**
 * Extract file data from multipart form data
 */
function extractFileFromMultipart(contents, boundary) {
  try {
    const parts = contents.split('--' + boundary);
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (part.indexOf('filename=') !== -1) {
        const filenameMatch = part.match(/filename="([^"]+)"/);
        const filename = filenameMatch ? filenameMatch[1] : 'unknown';
        
        const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
        const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
        
        const contentStart = part.indexOf('\r\n\r\n');
        if (contentStart !== -1) {
          const fileContent = part.substring(contentStart + 4);
          return {
            filename: filename,
            contentType: contentType,
            content: fileContent.trim()
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    Logger.log('Error extracting file: ' + error.toString());
    return null;
  }
}

/**
 * Parse CSV content into 2D array
 */
function parseCSV(content) {
  try {
    const lines = content.split(/\r?\n/);
    const data = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const row = parseCSVLine(line);
        data.push(row);
      }
    }
    
    return data;
  } catch (error) {
    Logger.log('Error parsing CSV: ' + error.toString());
    return [];
  }
}

/**
 * Parse a single CSV line handling quotes and escaped characters
 */
function parseCSVLine(line) {
  const result = [];
  let cell = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = i < line.length - 1 ? line[i + 1] : null;
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  
  result.push(cell);
  return result;
}

/**
 * Create HTTP response
 */
function createResponse(statusCode, message, additionalData) {
  const response = {
    status: statusCode,
    message: message
  };
  
  if (additionalData) {
    Object.assign(response, additionalData);
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// HELPER FUNCTIONS - Shared
// ============================================================================

/**
 * Fetches a report from Bob API and returns parsed CSV rows
 */
function fetchBobReport(reportId) {
  const apiUrl = `https://api.hibob.com/v1/company/reports/${reportId}/download?format=csv&locale=en-CA`;
  const creds = getBobCredentials();
  const basicAuth = Utilities.base64Encode(`${creds.id}:${creds.key}`);
  
  const res = UrlFetchApp.fetch(apiUrl, {
    method: "get",
    headers: { 
      accept: "text/csv",
      authorization: `Basic ${basicAuth}` 
    },
    muteHttpExceptions: true
  });
  
  if (res.getResponseCode() !== 200) {
    throw new Error(`Failed to fetch CSV: ${res.getResponseCode()} - ${res.getContentText()}`);
  }
  
  const rows = Utilities.parseCsv(res.getContentText());
  if (!rows || rows.length === 0) {
    throw new Error("CSV contained no data.");
  }
  
  return rows;
}

/**
 * Gets Bob API credentials from Script Properties
 */
function getBobCredentials() {
  const id = PropertiesService.getScriptProperties().getProperty("BOB_ID");
  const key = PropertiesService.getScriptProperties().getProperty("BOB_KEY");
  
  if (!id || !key) {
    throw new Error("Missing BOB_ID or BOB_KEY in Script Properties. Please set these in Project Settings → Script Properties.");
  }
  
  return { id, key };
}

/**
 * Normalizes a header row for efficient searching
 */
function normalizeHeader(headerRow) {
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  return headerRow.map(norm);
}

/**
 * Finds a column index using cached normalized header
 */
function findColCached(normalizedHeader, originalHeader, aliases) {
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  
  for (const alias of aliases) {
    const i = normalizedHeader.indexOf(norm(alias));
    if (i !== -1) return i;
  }
  
  throw new Error(`Could not find any of the columns [${aliases.join(", ")}]. Available headers: ${originalHeader.join(" | ")}`);
}

/**
 * Finds a column index optionally using cached normalized header
 */
function findColOptionalCached(normalizedHeader, originalHeader, aliases) {
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  
  for (const alias of aliases) {
    const i = normalizedHeader.indexOf(norm(alias));
    if (i !== -1) return i;
  }
  
  return -1;
}

/**
 * Writes data to a sheet with optional formatting
 */
function writeToSheet(sheetName, data, formats = []) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  
  sheet.clearContents();
  const dataRange = sheet.getRange(1, 1, data.length, data[0].length);
  dataRange.setValues(data);
  
  const maxRows = sheet.getMaxRows();
  const dataRows = data.length;
  if (maxRows > dataRows) {
    sheet.deleteRows(dataRows + 1, maxRows - dataRows);
  }
  
  dataRange.setFontFamily("Roboto");
  dataRange.setFontSize(10);
  sheet.autoResizeColumns(1, data[0].length);
  
  const header = data[0];
  const empIdHeaderIndex = header.findIndex(h => 
    h && (h.toString().toLowerCase().includes("employee id") || h.toString().toLowerCase().includes("emp id"))
  );
  if (empIdHeaderIndex >= 0 && data.length > 1) {
    const empIdCol = empIdHeaderIndex + 1;
    const empIdRange = sheet.getRange(2, empIdCol, data.length - 1, 1);
    empIdRange.setNumberFormat("@");
    const empIdValues = empIdRange.getValues();
    empIdRange.setValues(empIdValues.map(row => [String(row[0])]));
  }
  
  const numRows = data.length - 1;
  if (numRows > 0 && formats.length > 0) {
    formats.forEach(({ range, format }) => {
      if (format) {
        sheet.getRange(range[0], range[1], numRows, 1).setNumberFormat(format);
      }
    });
  }
}

/**
 * Safely extracts a cell value from a row
 */
function safeCell(row, idx) {
  return idx === -1 ? "" : (row[idx] == null ? "" : String(row[idx]).trim());
}

/**
 * Safely converts a value to a number, removing non-numeric characters
 */
function toNumberSafe(val) {
  if (val == null || val === "") return NaN;
  return Number(String(val).replace(/[^\d.-]/g, ""));
}

/**
 * Converts a column number to letter notation (1=A, 2=B, 27=AA, etc.)
 */
function columnToLetter(col) {
  let letter = "";
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

/**
 * Parses a date string into a Date object, handling multiple formats
 */
function parseDateSmart(s) {
  if (!s) return s;
  
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  
  return new Date(s);
}

/**
 * Extracts YYYY-MM-DD format from a date string
 */
function toYmd(s) {
  if (!s) return "";
  
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  
  return "";
}

/**
 * Test function - can be run manually to verify setup
 */
function testSheetAccess() {
  try {
    const spreadsheet = SpreadsheetApp.openById(PERF_SHEET_ID);
    Logger.log('Successfully accessed spreadsheet: ' + spreadsheet.getName());
    
    let sheet = spreadsheet.getSheetByName(SHEET_NAMES.PERF_REPORT);
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAMES.PERF_REPORT);
      Logger.log('Created new sheet: ' + SHEET_NAMES.PERF_REPORT);
    } else {
      Logger.log('Found existing sheet: ' + SHEET_NAMES.PERF_REPORT);
    }
    
    sheet.getRange('A1').setValue('Test successful at ' + new Date());
    return 'Test passed!';
  } catch (error) {
    Logger.log('Test failed: ' + error.toString());
    return 'Test failed: ' + error.toString();
  }
}

