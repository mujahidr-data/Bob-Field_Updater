/**
 * ================================
 * HiBob Data Updater – CONFIG FILE
 * Version: 2.0
 * Date: 2025-10-29
 * ================================
 *
 * This file provides:
 *   • Global constants (base URL, sheet names)
 *   • Credential storage helpers (service user ID + token)
 *   • Shared getter for credentials (with Base64 auth header)
 *
 * Used by: main-v2.0-20251029.gs
 */

/** ----------- GLOBAL CONFIG ------------- */
const CONFIG = Object.freeze({
  /** HiBob API base (switch to sandbox if needed) */
  HIBOB_BASE_URL: 'https://api.hibob.com',

  /** Sheet names */
  META_SHEET: 'Bob Fields Meta Data',
  LISTS_SHEET: 'Bob Lists',
  EMPLOYEES_SHEET: 'Employees',
  UPDATES_SHEET: 'Uploader',
  HISTORY_SHEET: 'History Uploader',
  DOCS_SHEET: 'Bob Updater Guide',
  
  /** API Rate Limits */
  PUTS_PER_MINUTE: 10,
  RETRY_BACKOFF_MS: 300,
  
  /** Logging & Debugging */
  LOG_VERBOSE: true,
  
  /** Employee Search Settings */
  DEFAULT_EMPLOYMENT_STATUS: 'Active',
  SEARCH_HUMANREADABLE: 'APPEND',
  
  /** UI Colors */
  COLORS: {
    HEADER: '#4285F4',
    HEADER_TEXT: '#FFFFFF',
    INPUT_REQUIRED: '#FFF3CD',
    INPUT_OPTIONAL: '#F8F9FA',
    SUCCESS: '#D9EAD3',
    WARNING: '#FFF2CC',
    ERROR: '#F4CCCC',
    INFO: '#CFE2F3',
    SECTION_HEADER: '#E8EAED'
  }
});

/** ----------- CREDENTIAL MANAGEMENT ------------- */

/**
 * Store HiBob service user credentials
 * 
 * @param {string} id - Service user ID/email
 * @param {string} token - Service user API token
 */
function setBobServiceUser(id, token) {
  if (!id || !token) {
    throw new Error('Both service user ID and token are required.');
  }
  
  const props = PropertiesService.getScriptProperties();
  props.setProperty('HIBOB_SERVICE_USER_ID', id);
  props.setProperty('HIBOB_SERVICE_USER_TOKEN', token);
  
  Logger.log('✅ HiBob service user credentials saved successfully.');
  Logger.log(`   User ID: ${id}`);
  Logger.log('   Token: ••••••••• (hidden)');
  
  try {
    const { auth } = getCreds_();
    Logger.log('✅ Credentials validated and Base64 auth header generated.');
  } catch (e) {
    Logger.log('⚠️ Warning: Could not validate credentials: ' + e.message);
  }
}

/**
 * Retrieve stored credentials and ready-to-use Base64 Authorization header
 *
 * @returns {Object} { id, token, auth }
 * @throws {Error} If credentials are not configured
 */
function getCreds_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('HIBOB_SERVICE_USER_ID');
  const token = props.getProperty('HIBOB_SERVICE_USER_TOKEN');

  if (!id || !token) {
    throw new Error(
      '❌ Missing HiBob credentials.\n\n' +
      'Please run: setBobServiceUser("<SERVICE_USER_ID>", "<SERVICE_USER_TOKEN>")\n\n' +
      'To get your credentials:\n' +
      '1. Log in to HiBob as an admin\n' +
      '2. Go to Settings > API > Service Users\n' +
      '3. Create or copy existing service user credentials'
    );
  }

  const auth = Utilities.base64Encode(`${id}:${token}`);
  
  if (CONFIG.LOG_VERBOSE) {
    Logger.log(`🔐 Using HiBob service user: ${id}`);
  }

  return { id, token, auth };
}

/**
 * Reset stored credentials
 */
function resetBobCredentials() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('HIBOB_SERVICE_USER_ID');
  props.deleteProperty('HIBOB_SERVICE_USER_TOKEN');
  Logger.log('🧹 Cleared stored HiBob credentials.');
  Logger.log('Run setBobServiceUser() to set new credentials.');
}

/**
 * View current credentials (token partially hidden)
 */
function viewBobCredentials() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('HIBOB_SERVICE_USER_ID');
  const token = props.getProperty('HIBOB_SERVICE_USER_TOKEN');
  
  Logger.log('📋 Current HiBob Credentials:');
  Logger.log({
    'Service User ID': id || '(not set)',
    'Service User Token': token ? '••••••••••••' + token.slice(-4) + ' (hidden)' : '(not set)',
    'Status': (id && token) ? '✅ Configured' : '❌ Not configured'
  });
  
  if (!id || !token) {
    Logger.log('\n⚠️ Credentials not configured. Run setBobServiceUser() first.');
  }
}

/**
 * Test API connection with current credentials
 */
function testBobConnection() {
  try {
    const { auth, id } = getCreds_();
    Logger.log(`🧪 Testing connection with service user: ${id}`);
    
    const url = `${CONFIG.HIBOB_BASE_URL}/v1/company/people/fields`;
    const resp = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: { 
        Authorization: `Basic ${auth}`, 
        Accept: 'application/json' 
      }
    });
    
    const code = resp.getResponseCode();
    
    if (code === 200) {
      Logger.log('✅ Connection successful! API responded with 200 OK.');
      const data = JSON.parse(resp.getContentText());
      Logger.log(`📊 Retrieved ${Array.isArray(data) ? data.length : 'unknown'} fields from HiBob.`);
    } else if (code === 401) {
      Logger.log('❌ Authentication failed (401 Unauthorized).');
      Logger.log('Please check your service user credentials.');
    } else if (code === 403) {
      Logger.log('❌ Access forbidden (403). Service user may lack permissions.');
    } else {
      Logger.log(`⚠️ Unexpected response: HTTP ${code}`);
      Logger.log(resp.getContentText().slice(0, 200));
    }
    
  } catch (e) {
    Logger.log('❌ Connection test failed: ' + e.message);
  }
}

/**
 * ================================
 * HiBob Data Updater - UTILITIES
 * Version: 2.0
 * Date: 2025-10-29
 * ================================
 *
 * Shared helper functions used across main.gs
 */

/* ===== Sheet Management ===== */

/**
 * Get existing sheet or create if not exists
 * @param {string} sheetName - Name of the sheet
 * @returns {Sheet} The sheet object
 */
function getOrCreateSheet_(sheetName) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  return sheet;
}

/**
 * Safely create filter on a sheet (ignores errors if filter exists)
 * @param {Sheet} sheet - The sheet to add filter to
 */
function safeCreateFilter_(sheet) {
  try {
    if (sheet.getFilter()) {
      sheet.getFilter().remove();
    }
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow > 0 && lastCol > 0) {
      sheet.getRange(1, 1, lastRow, lastCol).createFilter();
    }
  } catch (e) {
    Logger.log('Note: Could not create filter - ' + e.message);
  }
}

/**
 * Auto-fit ALL columns for better readability
 * @param {Sheet} sheet - The sheet to auto-fit
 */
function autoFitAllColumns_(sheet) {
  try {
    const lastCol = sheet.getLastColumn();
    if (lastCol > 0) {
      for (let i = 1; i <= lastCol; i++) {
        sheet.autoResizeColumn(i);
        // Add a bit of padding
        const currentWidth = sheet.getColumnWidth(i);
        sheet.setColumnWidth(i, Math.min(currentWidth + 20, 500));
      }
    }
  } catch (e) {
    Logger.log('Note: Could not auto-fit columns - ' + e.message);
  }
}

/**
 * Auto-fit specific columns
 * @param {Sheet} sheet - The sheet to auto-fit
 * @param {number} numCols - Number of columns to auto-fit
 */
function autoFit_(sheet, numCols) {
  try {
    for (let i = 1; i <= numCols; i++) {
      sheet.autoResizeColumn(i);
      // Add padding
      const currentWidth = sheet.getColumnWidth(i);
      sheet.setColumnWidth(i, Math.min(currentWidth + 20, 500));
    }
  } catch (e) {
    Logger.log('Note: Could not auto-fit columns - ' + e.message);
  }
}

/**
 * Format header row with consistent styling
 * @param {Sheet} sheet - The sheet
 * @param {number} row - Header row number
 * @param {number} numCols - Number of columns in header
 */
function formatHeaderRow_(sheet, row, numCols) {
  const headerRange = sheet.getRange(row, 1, 1, numCols);
  headerRange
    .setBackground(CONFIG.COLORS.HEADER)
    .setFontColor(CONFIG.COLORS.HEADER_TEXT)
    .setFontWeight('bold')
    .setFontSize(11);
}

/**
 * Format a cell as a required input field
 * @param {Range} range - The cell range
 * @param {string} placeholder - Optional placeholder text
 */
function formatRequiredInput_(range, placeholder) {
  range
    .setBackground(CONFIG.COLORS.INPUT_REQUIRED)
    .setBorder(true, true, true, true, false, false, '#F9CB9C', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  
  if (placeholder) {
    range.setNote('REQUIRED: ' + placeholder);
  }
}

/**
 * Format a cell as an optional input field
 * @param {Range} range - The cell range
 * @param {string} note - Optional note text
 */
function formatOptionalInput_(range, note) {
  range
    .setBackground(CONFIG.COLORS.INPUT_OPTIONAL)
    .setBorder(true, true, true, true, false, false, '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID);
  
  if (note) {
    range.setNote('OPTIONAL: ' + note);
  }
}

/**
 * Format section header
 * @param {Range} range - The range to format
 * @param {string} text - Header text
 */
function formatSectionHeader_(range, text) {
  range
    .setValue(text)
    .setBackground(CONFIG.COLORS.SECTION_HEADER)
    .setFontWeight('bold')
    .setFontSize(12)
    .setBorder(false, false, true, false, false, false, '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

/* ===== Data Formatting Helpers ===== */

/**
 * Safely convert value to string
 * @param {*} val - Value to convert
 * @returns {string} String representation or empty string
 */
function safe(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

/**
 * Convert boolean to string or return blank
 * @param {*} val - Value to convert
 * @returns {string} 'true', 'false', or ''
 */
function boolOrBlank(val) {
  if (val === true) return 'true';
  if (val === false) return 'false';
  return '';
}

/**
 * Convert object to JSON string or return blank
 * @param {*} obj - Object to stringify
 * @returns {string} JSON string or ''
 */
function jsonOrBlank(obj) {
  if (!obj) return '';
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return '';
  }
}

/**
 * Normalize blank/null values to empty string
 * @param {*} val - Value to normalize
 * @returns {string} The value or empty string
 */
function normalizeBlank_(val) {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val).trim();
  return str.toLowerCase() === 'null' ? '' : str;
}

/**
 * Try to parse JSON string safely
 * @param {string} str - JSON string to parse
 * @returns {Object|null} Parsed object or null
 */
function tryParseJson_(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

/* ===== UI Helpers ===== */

/**
 * Show toast notification
 * @param {string} msg - Message to display
 * @param {string} title - Optional title
 * @param {number} timeout - Optional timeout in seconds
 */
function toast_(msg, title, timeout) {
  SpreadsheetApp.getActive().toast(msg, title || 'Bob Updater', timeout || 5);
}

/* ===== Data Reading Helpers ===== */

/**
 * Read fields metadata from Bob Fields Meta Data sheet
 * @returns {Array} Array of field objects
 */
function readFields_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.META_SHEET);
  if (!sh) {
    throw new Error('Sheet "' + CONFIG.META_SHEET + '" not found. Run "1. Pull Fields" first.');
  }
  
  const data = sh.getDataRange().getValues();
  if (data.length < 3) {
    throw new Error('Sheet "' + CONFIG.META_SHEET + '" is empty. Run "1. Pull Fields" first.');
  }
  
  // Header is on row 2 (index 1), row 1 (index 0) is the title
  const header = data[1].map(function(x) { return String(x || '').trim(); });
  const iId = header.indexOf('id');
  const iName = header.indexOf('name');
  const iPath = header.indexOf('jsonPath');
  const iType = header.indexOf('type');
  const iCalc = header.indexOf('calculated');
  const iTypeData = header.indexOf('typeData (raw JSON)');
  
  const fields = [];
  // Data starts at row 3 (index 2)
  for (var r = 2; r < data.length; r++) {
    var row = data[r];
    var typeData = null;
    if (iTypeData >= 0) {
      typeData = tryParseJson_(row[iTypeData]);
    }
    
    fields.push({
      id: iId >= 0 ? safe(row[iId]) : '',
      name: iName >= 0 ? safe(row[iName]) : '',
      jsonPath: iPath >= 0 ? safe(row[iPath]) : '',
      type: iType >= 0 ? safe(row[iType]) : '',
      calculated: iCalc >= 0 ? safe(row[iCalc]) : '',
      typeData: typeData || {}
    });
  }
  
  return fields;
}

/**
 * Build mapping of CIQ ID to Bob ID from Employees sheet
 * @returns {Object} Map of CIQ -> Bob ID
 */
function buildCiqToBobMap_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.EMPLOYEES_SHEET);
  if (!sh) {
    throw new Error('Sheet "' + CONFIG.EMPLOYEES_SHEET + '" not found. Run "2. Pull Employees" first.');
  }
  
  const data = sh.getDataRange().getValues();
  if (data.length < 8) return {};
  
  // Header is at row 7 (index 6)
  const header = data[6].map(function(x) { return String(x || '').trim(); });
  const iCiq = header.indexOf('CIQ ID');
  const iBob = header.indexOf('Bob ID');
  
  if (iCiq < 0 || iBob < 0) {
    throw new Error('Could not find "CIQ ID" or "Bob ID" columns in Employees sheet.');
  }
  
  const map = {};
  for (var r = 7; r < data.length; r++) {
    const ciq = String(data[r][iCiq] || '').trim();
    const bob = String(data[r][iBob] || '').trim();
    if (ciq && bob) {
      map[ciq] = bob;
    }
  }
  
  return map;
}

/**
 * Build reverse mapping of Bob ID to CIQ ID
 * @returns {Object} Map of Bob ID -> CIQ ID
 */
function buildBobToCiqMap_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.EMPLOYEES_SHEET);
  if (!sh) return {};
  
  const data = sh.getDataRange().getValues();
  if (data.length < 8) return {};
  
  const header = data[6].map(function(x) { return String(x || '').trim(); });
  const iCiq = header.indexOf('CIQ ID');
  const iBob = header.indexOf('Bob ID');
  
  if (iCiq < 0 || iBob < 0) return {};
  
  const map = {};
  for (var r = 7; r < data.length; r++) {
    const ciq = String(data[r][iCiq] || '').trim();
    const bob = String(data[r][iBob] || '').trim();
    if (ciq && bob) {
      map[bob] = ciq;
    }
  }
  
  return map;
}

/**
 * Build mapping of list label to ID
 * @param {string} listName - Name of the list
 * @returns {Object} Map of label -> ID (both original and lowercase)
 */
function buildListLabelToId_(listName) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.LISTS_SHEET);
  if (!sh) return {};
  
  const vals = sh.getDataRange().getValues();
  if (vals.length < 3) return {};
  
  // Header is on row 2 (index 1)
  const head = vals[1].map(function(x) { return String(x || '').trim(); });
  const iList = head.indexOf('listName');
  const iValId = head.indexOf('valueId');
  const iValLbl = head.indexOf('valueLabel');
  
  if (iList < 0 || iValId < 0 || iValLbl < 0) return {};
  
  const map = {};
  // Data starts at row 3 (index 2)
  for (var r = 2; r < vals.length; r++) {
    if (String(vals[r][iList] || '').trim() === listName) {
      const id = String(vals[r][iValId] || '').trim();
      const lbl = String(vals[r][iValLbl] || '').trim();
      if (lbl && id) {
        map[lbl] = id;
        map[lbl.toLowerCase()] = id;
      }
    }
  }
  
  return map;
}

/**
 * Build list name to values map
 * @returns {Object} Map of listName -> { id -> {id, label} }
 */
function buildListNameMap_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.LISTS_SHEET);
  if (!sh) return {};
  
  const vals = sh.getDataRange().getValues();
  if (vals.length < 3) return {};
  
  // Header is on row 2 (index 1), row 1 (index 0) is the title
  const head = vals[1].map(function(x) { return String(x || '').trim(); });
  const iList = head.indexOf('listName');
  const iValId = head.indexOf('valueId');
  const iValLbl = head.indexOf('valueLabel');
  
  if (iList < 0 || iValId < 0 || iValLbl < 0) return {};
  
  const map = {};
  // Data starts at row 3 (index 2)
  for (var r = 2; r < vals.length; r++) {
    const listName = String(vals[r][iList] || '').trim();
    const valId = String(vals[r][iValId] || '').trim();
    const valLbl = String(vals[r][iValLbl] || '').trim();
    
    if (listName && valId) {
      if (!map[listName]) map[listName] = {};
      map[listName][valId] = { id: valId, label: valLbl };
    }
  }
  
  return map;
}

/**
 * Find work custom column by value - dynamic lookup from Bob Lists
 * Searches for work.column_*, work.field_*, work.customColumns.column_* entries
 * @param {string} valueToFind - The label value to look up
 * @returns {Object|null} { columnKey, valueId, listName } or null if not found
 */
function findWorkCustomColumn_(valueToFind) {
  if (!valueToFind) return null;
  
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.LISTS_SHEET);
  if (!sh) return null;
  
  const vals = sh.getDataRange().getValues();
  if (vals.length < 3) return null;
  
  // Header is on row 2 (index 1)
  const head = vals[1].map(h => String(h || '').trim());
  const iList = head.indexOf('listName');
  const iValId = head.indexOf('valueId');
  const iValLbl = head.indexOf('valueLabel');
  
  if (iList < 0 || iValId < 0 || iValLbl < 0) return null;
  
  const searchValue = String(valueToFind).trim();
  const searchLower = searchValue.toLowerCase();
  
  // Data starts at row 3 (index 2)
  for (let r = 2; r < vals.length; r++) {
    const listName = String(vals[r][iList] || '').trim();
    const valueId = String(vals[r][iValId] || '').trim();
    const valueLabel = String(vals[r][iValLbl] || '').trim();
    
    // Check if this is a work custom field (column_ or field_)
    if (listName.startsWith('work.') && 
        (listName.includes('column_') || listName.includes('field_'))) {
      
      // Check if value matches
      if (valueLabel === searchValue || valueLabel.toLowerCase() === searchLower) {
        // Extract column key from listName
        // Handles: work.column_XXX, work.field_XXX, work.customColumns.column_XXX
        const parts = listName.split('.');
        const columnKey = parts[parts.length - 1]; // Get last part (column_XXX or field_XXX)
        
        Logger.log(`   🔎 Found in Bob Lists: "${valueLabel}" → ${listName} → key: ${columnKey}, id: ${valueId}`);
        return { columnKey, valueId, listName };
      }
    }
  }
  
  Logger.log(`   🔎 Not found in Bob Lists for work custom fields: "${valueToFind}"`);
  return null;
}

/**
 * Find text field column key by field name from Bob Lists
 * For text fields where the valueLabel IS the field name (e.g., "Team")
 * @param {string} fieldName - The field name to look up (e.g., "Team")
 * @returns {string|null} The column key (e.g., "column_1699014211468") or null
 */
function findTextFieldColumnKey_(fieldName) {
  if (!fieldName) return null;
  
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.LISTS_SHEET);
  if (!sh) return null;
  
  const vals = sh.getDataRange().getValues();
  if (vals.length < 3) return null;
  
  const head = vals[1].map(h => String(h || '').trim());
  const iList = head.indexOf('listName');
  const iValLbl = head.indexOf('valueLabel');
  
  if (iList < 0 || iValLbl < 0) return null;
  
  const searchLower = fieldName.toLowerCase();
  
  for (let r = 2; r < vals.length; r++) {
    const listName = String(vals[r][iList] || '').trim();
    const valueLabel = String(vals[r][iValLbl] || '').trim();
    
    // Look for work custom field where valueLabel matches the field name
    if (listName.startsWith('work.') && 
        (listName.includes('column_') || listName.includes('field_'))) {
      
      if (valueLabel.toLowerCase() === searchLower) {
        const parts = listName.split('.');
        const columnKey = parts[parts.length - 1];
        Logger.log(`   🔎 Found text field: "${fieldName}" → ${listName} → key: ${columnKey}`);
        return columnKey;
      }
    }
  }
  
  Logger.log(`   🔎 Text field not found by valueLabel: "${fieldName}"`);
  return null;
}

/**
 * Create a new list item in Bob if it doesn't exist
 * @param {string} listName - The list name (e.g., 'title', 'department')
 * @param {string} itemName - The item name to create
 * @returns {string|null} The new item's ID or null if failed
 */
function createListItemIfNotExists_(listName, itemName) {
  if (!listName || !itemName) return null;
  
  Logger.log(`   🆕 Creating new ${listName} item: "${itemName}"`);
  
  const url = `${CONFIG.BASE_URL}/v1/metadata/lists/${encodeURIComponent(listName)}`;
  const payload = { name: itemName };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: buildAuthHeaders_(),
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const text = response.getContentText();
    
    if (code === 200 || code === 201) {
      const result = JSON.parse(text);
      const newId = result.id || result.valueId;
      Logger.log(`   ✅ Created ${listName} item: "${itemName}" → ID: ${newId}`);
      
      // Add to Bob Lists sheet for future lookups
      addToBobListsSheet_(listName, newId, itemName);
      
      return String(newId);
    } else {
      Logger.log(`   ❌ Failed to create ${listName} item: ${code} - ${text}`);
      return null;
    }
  } catch (e) {
    Logger.log(`   ❌ Error creating ${listName} item: ${e.message}`);
    return null;
  }
}

/**
 * Add a new list item to the Bob Lists sheet
 * @param {string} listName - The list name
 * @param {string} valueId - The item ID
 * @param {string} valueLabel - The item label
 */
function addToBobListsSheet_(listName, valueId, valueLabel) {
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.LISTS_SHEET);
    if (!sh) return;
    
    // Append new row
    sh.appendRow([listName, valueId, valueLabel, '']);
    Logger.log(`   📝 Added to Bob Lists: ${listName} | ${valueId} | ${valueLabel}`);
  } catch (e) {
    Logger.log(`   ⚠️ Could not add to Bob Lists sheet: ${e.message}`);
  }
}

/**
 * Get or create a title ID - looks up existing, creates if not found
 * @param {string} titleLabel - The title name
 * @returns {string|null} The title ID (existing or newly created)
 */
function getOrCreateTitleId_(titleLabel) {
  if (!titleLabel) return null;
  
  // First try existing lookup
  const titleMap = buildListLabelToIdMap_('title');
  const existingId = titleMap[titleLabel] || titleMap[titleLabel.toLowerCase()];
  
  if (existingId) {
    Logger.log(`   🔍 Title exists: "${titleLabel}" → ${existingId}`);
    return existingId;
  }
  
  // Not found - create new title
  Logger.log(`   🆕 Title not found, creating: "${titleLabel}"`);
  const newId = createListItemIfNotExists_('title', titleLabel);
  
  return newId;
}

/**
 * Find ELT value ID by employee name
 * Searches Bob Lists for any entry matching the employee name
 * @param {string} employeeName - The employee name to look up
 * @returns {string|null} The value ID or null
 */
function findEltValueId_(employeeName) {
  if (!employeeName) return null;
  
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.LISTS_SHEET);
  if (!sh) return null;
  
  const vals = sh.getDataRange().getValues();
  if (vals.length < 3) return null;
  
  const head = vals[1].map(h => String(h || '').trim());
  const iList = head.indexOf('listName');
  const iValId = head.indexOf('valueId');
  const iValLbl = head.indexOf('valueLabel');
  
  if (iList < 0 || iValId < 0 || iValLbl < 0) return null;
  
  const searchValue = String(employeeName).trim();
  const searchLower = searchValue.toLowerCase();
  
  Logger.log(`   🔎 Looking for ELT employee: "${searchValue}"`);
  
  // Search ALL entries for matching employee name
  for (let r = 2; r < vals.length; r++) {
    const listName = String(vals[r][iList] || '').trim();
    const valueId = String(vals[r][iValId] || '').trim();
    const valueLabel = String(vals[r][iValLbl] || '').trim();
    
    // Match employee name in valueLabel
    if (valueLabel === searchValue || valueLabel.toLowerCase() === searchLower) {
      // Prefer work.* entries but accept any match
      if (listName.startsWith('work.') || listName.includes('ELT') || listName.includes('elt')) {
        Logger.log(`   🔎 Found ELT: "${valueLabel}" → ID: ${valueId} (from ${listName})`);
        return valueId;
      }
    }
  }
  
  // Second pass: match any entry with this employee name
  for (let r = 2; r < vals.length; r++) {
    const valueId = String(vals[r][iValId] || '').trim();
    const valueLabel = String(vals[r][iValLbl] || '').trim();
    
    if (valueLabel === searchValue || valueLabel.toLowerCase() === searchLower) {
      Logger.log(`   🔎 Found ELT (fallback): "${valueLabel}" → ID: ${valueId}`);
      return valueId;
    }
  }
  
  Logger.log(`   🔎 ELT employee not found: "${searchValue}"`);
  return null;
}

/**
 * Find column key by searching listName for a pattern
 * Fallback method when valueLabel lookup fails
 * @param {string} pattern - Pattern to search for in listName (e.g., "Team")
 * @returns {string|null} The column key or null
 */
function findColumnKeyByListNamePattern_(pattern) {
  if (!pattern) return null;
  
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.LISTS_SHEET);
  if (!sh) return null;
  
  const vals = sh.getDataRange().getValues();
  if (vals.length < 3) return null;
  
  const head = vals[1].map(h => String(h || '').trim());
  const iList = head.indexOf('listName');
  const iValLbl = head.indexOf('valueLabel');
  const iValId = head.indexOf('valueId');
  
  if (iList < 0) return null;
  
  const searchLower = pattern.toLowerCase();
  
  // Also check all columns in case header names vary
  for (let r = 2; r < vals.length; r++) {
    const listName = String(vals[r][iList] || '').trim();
    const valueLabel = iValLbl >= 0 ? String(vals[r][iValLbl] || '').trim() : '';
    const valueId = iValId >= 0 ? String(vals[r][iValId] || '').trim() : '';
    
    // Look for work custom field
    if (listName.startsWith('work.') && 
        (listName.includes('column_') || listName.includes('field_'))) {
      
      // Check if valueLabel or valueId contains the pattern
      if (valueLabel.toLowerCase() === searchLower || 
          valueId.toLowerCase() === searchLower) {
        const parts = listName.split('.');
        const columnKey = parts[parts.length - 1];
        Logger.log(`   🔎 Found by pattern: "${pattern}" → ${listName} → key: ${columnKey}`);
        return columnKey;
      }
    }
  }
  
  Logger.log(`   🔎 Column not found by pattern: "${pattern}"`);
  return null;
}

/**
 * Find workChangeType value ID from Bob Lists
 * @param {string} changeTypeLabel - The change type label to look up
 * @returns {string|null} The value ID or null
 */
function findWorkChangeTypeId_(changeTypeLabel) {
  if (!changeTypeLabel) return null;
  
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.LISTS_SHEET);
  if (!sh) {
    Logger.log(`   🔎 workChangeType: Bob Lists sheet not found`);
    return null;
  }
  
  const vals = sh.getDataRange().getValues();
  if (vals.length < 3) return null;
  
  const head = vals[1].map(h => String(h || '').trim());
  const iList = head.indexOf('listName');
  const iValId = head.indexOf('valueId');
  const iValLbl = head.indexOf('valueLabel');
  
  if (iList < 0 || iValId < 0 || iValLbl < 0) {
    Logger.log(`   🔎 workChangeType: Column headers not found (listName: ${iList}, valueId: ${iValId}, valueLabel: ${iValLbl})`);
    return null;
  }
  
  const searchValue = String(changeTypeLabel).trim();
  const searchLower = searchValue.toLowerCase();
  
  Logger.log(`   🔎 Looking for workChangeType: "${searchValue}"`);
  
  let foundWorkChangeTypes = [];
  for (let r = 2; r < vals.length; r++) {
    const listName = String(vals[r][iList] || '').trim();
    const valueId = String(vals[r][iValId] || '').trim();
    const valueLabel = String(vals[r][iValLbl] || '').trim();
    
    if (listName === 'workChangeType') {
      foundWorkChangeTypes.push({ valueId, valueLabel });
      if (valueLabel === searchValue || valueLabel.toLowerCase() === searchLower) {
        Logger.log(`   🔎 FOUND workChangeType: "${valueLabel}" → ID: ${valueId}`);
        return valueId;
      }
    }
  }
  
  Logger.log(`   🔎 workChangeType "${searchValue}" NOT FOUND. Available values: ${JSON.stringify(foundWorkChangeTypes)}`);
  return null;
}

/**
 * Get list of available sites from Bob Lists
 * @returns {Array<string>} Array of site names
 */
function getSitesList_() {
  const listMap = buildListNameMap_();
  if (listMap['Site']) {
    return Object.values(listMap['Site']).map(function(v) { return v.label; }).filter(Boolean);
  }
  return [];
}

/**
 * Get list of available locations from Bob Lists
 * @returns {Array<string>} Array of location names
 */
function getLocationsList_() {
  const listMap = buildListNameMap_();
  if (listMap['Location']) {
    return Object.values(listMap['Location']).map(function(v) { return v.label; }).filter(Boolean);
  }
  return [];
}

/* ===== Upload Helpers ===== */

/**
 * Write upload result to Uploader sheet
 * @param {Sheet} sheet - The uploader sheet
 * @param {number} row - Row number
 * @param {string} status - Status message
 * @param {number|string} code - HTTP code
 * @param {string} error - Error message
 * @param {string} verified - Verified value
 */
function writeUploaderResult_(sheet, row, status, code, error, verified) {
  sheet.getRange(row, 5).setValue(status);
  sheet.getRange(row, 6).setValue(code);
  sheet.getRange(row, 7).setValue(error);
  sheet.getRange(row, 8).setValue(verified);
  
  const statusCell = sheet.getRange(row, 5);
  if (status === 'COMPLETED') {
    statusCell.setBackground(CONFIG.COLORS.SUCCESS);
  } else if (status === 'SKIP') {
    statusCell.setBackground(CONFIG.COLORS.WARNING);
  } else if (status === 'FAILED') {
    statusCell.setBackground(CONFIG.COLORS.ERROR);
  } else if (status.indexOf('Processing') >= 0) {
    statusCell.setBackground(CONFIG.COLORS.INFO);
  }
}

/**
 * Build PUT request body for updating a field
 * @param {string} jsonPath - Field's JSON path
 * @param {*} value - Value to set
 * @returns {Object} Request body object
 */
function buildPutBody_(jsonPath, value) {
  const parts = jsonPath.replace(/^root\./, '').split('.');
  const body = {};
  
  // Special handling for custom fields per Bob API docs:
  // https://apidocs.hibob.com/docs/update-employee-data#how-to-update-custom-fields
  // Custom fields should use the full field ID (with category) as the key
  // Example: userData.custom.category_123.field_456 becomes:
  // { "userData": { "custom": { "category_123.field_456": value } } }
  
  if (parts.length >= 3 && parts[0] === 'userData' && parts[1] === 'custom') {
    // This is a custom field - join category.field as the key
    const customFieldId = parts.slice(2).join('.');
    return {
      userData: {
        custom: {
          [customFieldId]: value
        }
      }
    };
  }
  
  // Standard nested structure for non-custom fields
  var current = body;
  for (var i = 0; i < parts.length - 1; i++) {
    current[parts[i]] = {};
    current = current[parts[i]];
  }
  
  current[parts[parts.length - 1]] = value;
  return body;
}

/**
 * Read back a field value after PUT to verify
 * @param {string} auth - Base64 auth header
 * @param {string} bobId - Employee Bob ID
 * @param {string} jsonPath - Field's JSON path
 * @returns {string} The field value or empty string
 */
function readBackField_(auth, bobId, jsonPath) {
  try {
    const url = CONFIG.HIBOB_BASE_URL + '/v1/people/' + encodeURIComponent(bobId);
    const resp = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: { 
        Authorization: 'Basic ' + auth, 
        Accept: 'application/json' 
      }
    });
    
    if (resp.getResponseCode() !== 200) return '';
    
    const person = JSON.parse(resp.getContentText());
    return String(getVal_(person, jsonPath) || '');
  } catch (e) {
    return '';
  }
}

/**
 * Get value from nested object using dot notation path
 * @param {Object} obj - Object to search
 * @param {string} path - Dot-notation path
 * @returns {*} The value or empty string
 */
function getVal_(obj, path) {
  if (!obj || !path) return '';
  
  if (path.indexOf('.') === -1 && path.indexOf('/') === -1) {
    const val = obj[path];
    if (val !== undefined && val !== null && val !== '') {
      return val;
    }
  }
  
  const parts = path.split('.');
  var current = obj;
  for (var i = 0; i < parts.length; i++) {
    if (current == null) break;
    current = current[parts[i]];
  }
  if (current !== undefined && current !== null && current !== '') {
    if (typeof current === 'object' && current !== null && 'value' in current) {
      return current.value;
    }
    return current;
  }
  
  const slashPath = '/' + path.replace(/\./g, '/');
  const slashNode = obj[slashPath];
  if (slashNode !== undefined && slashNode !== null) {
    if (typeof slashNode === 'object' && 'value' in slashNode) {
      return slashNode.value;
    }
    if (slashNode !== '') {
      return slashNode;
    }
  }
  
  if (path.indexOf('root.') !== 0) {
    const withRoot = getVal_(obj, 'root.' + path);
    if (withRoot) return withRoot;
  }
  
  return '';
}

/**
 * Get value with human-readable fallback
 * @param {Object} obj - Object to search
 * @param {string} path - Dot-notation path
 * @param {Object} idToLabelMap - Map of ID to label
 * @returns {*} The value or empty string
 */
function getValWithHumanReadable_(obj, path, idToLabelMap) {
  if (!obj || !path) return '';
  
  if (path.indexOf('custom.') >= 0) {
    const pathParts = path.replace(/^root\./, '').split('.');
    
    if (obj.humanReadable) {
      var hrValue = obj.humanReadable;
      for (var i = 0; i < pathParts.length; i++) {
        if (hrValue == null) break;
        hrValue = hrValue[pathParts[i]];
      }
      if (hrValue && hrValue !== '') {
        return hrValue;
      }
    }
    
    const machineValue = getVal_(obj, path);
    if (machineValue && idToLabelMap && idToLabelMap[machineValue]) {
      return idToLabelMap[machineValue];
    }
    if (machineValue) return machineValue;
  }
  
  return getVal_(obj, path);
}

/**
 * Sanitize field path for API requests
 * @param {string} path - Field path
 * @returns {string} Sanitized path
 */
function sanitiseFieldPath_(path) {
  if (String(path || '').indexOf('custom.') >= 0) {
    if (path.indexOf('root.') !== 0) {
      return 'root.' + path;
    }
    return path;
  }
  return String(path || '').replace(/^root\./, '');
}

/**
 * Build map of list ID to label
 * @param {string} listName - Name of the list
 * @returns {Object} Map of ID -> label
 */
function buildListIdToLabelMap_(listName) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.LISTS_SHEET);
  if (!sh) return {};
  const vals = sh.getDataRange().getValues();
  if (vals.length < 3) return {};
  // Header is on row 2 (index 1)
  const head = vals[1].map(function(x) { return String(x || '').trim(); });
  const iList = head.indexOf('listName');
  const iValId = head.indexOf('valueId');
  const iValLbl = head.indexOf('valueLabel');
  if (iList < 0 || iValId < 0 || iValLbl < 0) return {};
  const map = {};
  // Data starts at row 3 (index 2)
  for (var r = 2; r < vals.length; r++) {
    if (String(vals[r][iList] || '').trim() === listName) {
      const id = String(vals[r][iValId] || '').trim();
      const lbl = String(vals[r][iValLbl] || '').trim();
      if (id) map[id] = lbl || id;
    }
  }
  return map;
}

/*************************************************
 * HiBob Data Updater - MAIN FILE
 * Version: 2.0 - Simplified Status Filter
 * Date: 2025-10-29 (Update 4)
 * 
 * CHANGES in this update:
 * - Removed "Date of Termination" column (not needed)
 * - Simplified status filter to only "Active" and "Inactive" (removed "All")
 * - Fixed showInactive flag: false for Active, true for Inactive
 * - Changed humanReadable from APPEND to REPLACE for cleaner data
 * - Status now properly detected from work.isActive field
 * - Improved filter handling to prevent duplicate warnings
 *************************************************/

/* ===== Aliases from CONFIG ===== */
const BASE            = CONFIG.HIBOB_BASE_URL;
const SHEET_FIELDS    = CONFIG.META_SHEET;
const SHEET_LISTS     = CONFIG.LISTS_SHEET;
const SHEET_EMPLOYEES = CONFIG.EMPLOYEES_SHEET;
const SHEET_UPLOADER  = CONFIG.UPDATES_SHEET;

/* ===== Rate limiting for PUT /v1/people/{id} ===== */
const PUTS_PER_MIN = CONFIG.PUTS_PER_MINUTE || 10;
const PUT_DELAY_MS = Math.ceil(60000 / PUTS_PER_MIN);

/* ===== Batch upload constants ===== */
const BATCH_SIZE = 50;           // Process 50 rows per batch (5 min execution time)
const TRIGGER_INTERVAL = 1;      // Wait only 1 minute between batches (reduced from 5)
const MAX_EXECUTION_TIME = 330000; // Google Apps Script limit: 5.5 minutes

/* ===== NEW MENU STRUCTURE ===== */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  ui.createMenu('Bob')
    // Documentation
    .addItem('>> View Documentation', 'createDocumentationSheet')
    .addSeparator()
    
    // Test Connection
    .addItem('>> Test API Connection', 'testApiConnection')
    .addSeparator()
    
    // SETUP Section
    .addSubMenu(ui.createMenu('SETUP')
      .addItem('1. Pull Fields', 'pullFields')
      .addItem('2. Pull Lists', 'pullLists')
      .addItem('3. Pull Employees', 'setupAndPullEmployees')
      .addItem('   >> Refresh Employees (Keep Filters)', 'pullEmployees')
      .addSeparator()
      .addItem('4. Setup Field Uploader', 'showFieldSelector')
      .addSeparator()
      .addSubMenu(ui.createMenu('5. History Tables')
        .addItem('Setup History Uploader', 'setupHistoryUploader')
        .addItem('Generate Columns for Table', 'generateHistoryColumns')
      )
    )
    .addSeparator()
    
    // VALIDATE Section  
    .addSubMenu(ui.createMenu('VALIDATE')
      .addItem('Validate Field Upload Data', 'validateUploadData')
      .addItem('Validate History Upload Data', 'validateHistoryUpload')
    )
    .addSeparator()
    
    // UPLOAD Section
    .addSubMenu(ui.createMenu('UPLOAD')
      .addItem('Quick Upload (<40 rows)', 'runQuickUpload')
      .addItem('Batch Upload (40-1000+ rows)', 'runBatchUpload')
      .addItem('Retry Failed Rows Only', 'retryFailedRows')
      .addSeparator()
      .addItem('Quick History Upload', 'runQuickHistoryUpload')
      .addItem('Batch History Upload', 'runBatchHistoryUpload')
      .addItem('Retry Failed History Rows', 'retryFailedHistoryRows')
    )
    .addSeparator()
    
    // MONITORING Section
    .addSubMenu(ui.createMenu('MONITORING')
      .addItem('Check Batch Status', 'checkBatchStatus')
    )
    .addSeparator()
    
    // CONTROL Section
    .addSubMenu(ui.createMenu('CONTROL')
      .addItem('Stop Batch Upload', 'clearBatchUpload')
    )
    .addSeparator()
    
    // CLEANUP Section
    .addSubMenu(ui.createMenu('CLEANUP')
      .addItem('Clear All Upload Data', 'clearAllUploadData')
    )
    
    .addToUi();
}

/* =====================================================
 * Sheet 1  Fields metadata
 * ===================================================== */
function pullFields() {
  const { auth } = getCreds_();
  const sh = getOrCreateSheet_(SHEET_FIELDS);
  
  const url = `${BASE}/v1/company/people/fields`;
  const resp = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
  });
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  
  if (code !== 200) {
    throw new Error(`Failed to fetch fields (${code}): ${text.slice(0,500)}`);
  }
  
  const data = JSON.parse(text);
  const allFields = Array.isArray(data) ? data : (data.fields || []);
  sh.clear();
  
  sh.getRange('A1').setValue('Field Metadata  Pulled from HiBob')
    .setBackground(CONFIG.COLORS.HEADER)
    .setFontColor(CONFIG.COLORS.HEADER_TEXT)
    .setFontWeight('bold')
    .setFontSize(14);
  sh.getRange('A1:I1').mergeAcross();
  const headers = ['id', 'name', 'jsonPath', 'category', 'type', 'calculated', 'description', 'listName', 'typeData (raw JSON)'];
  sh.getRange(2, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow_(sh, 2, headers.length);
  const rows = [];
  allFields.forEach(f => {
    const fieldId = safe(f.id || '');
    const fieldName = safe(f.name || '');
    const jsonPath = safe(f.jsonPath || '');
    const category = safe(f.category || '');
    const fieldType = safe(f.type || '');
    const calculated = safe(f.calculated || '');
    const description = safe(f.description || '');
    const listName = safe(f.typeData?.listName || '');
    const typeDataJson = f.typeData ? JSON.stringify(f.typeData) : '';
    
    rows.push([fieldId, fieldName, jsonPath, category, fieldType, calculated, description, listName, typeDataJson]);
  });
  if (rows.length > 0) {
    sh.getRange(3, 1, rows.length, headers.length).setValues(rows);
  }
  autoFitAllColumns_(sh);
  toast_(`[OK] Fields: ${rows.length} rows pulled from HiBob`);
}

/* =====================================================
 * Sheet 2  List values for dropdowns
 * ===================================================== */
function pullLists() {
  const { auth } = getCreds_();
  const sh = getOrCreateSheet_(SHEET_LISTS);
  const url = `${BASE}/v1/company/named-lists`;
  const resp = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
  });
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  
  if (code !== 200) {
    throw new Error(`Failed to fetch named lists (${code}): ${text.slice(0,500)}`);
  }
  
  // HiBob returns an object where keys are list names
  const listsData = JSON.parse(text);
  sh.clear();
  
  sh.getRange('A1').setValue('List Values - Pulled from HiBob')
    .setBackground(CONFIG.COLORS.HEADER)
    .setFontColor(CONFIG.COLORS.HEADER_TEXT)
    .setFontWeight('bold')
    .setFontSize(14);
  sh.getRange('A1:D1').mergeAcross();
  const headers = ['listName', 'valueId', 'valueLabel', 'extraInfo'];
  sh.getRange(2, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow_(sh, 2, headers.length);
  const rows = [];
  
  // Iterate through each list in the object
  Object.keys(listsData).forEach(listKey => {
    const listObj = listsData[listKey];
    const listName = safe(listObj.name || listKey);
    
    // Try both 'items' and 'values' properties
    const items = listObj.items || listObj.values || [];
    
    if (items.length === 0) {
      rows.push([listName, '', '', '(No items)']);
    } else {
      items.forEach(item => {
        const itemId = safe(item.id || '');
        const itemLabel = safe(item.value || item.label || item.name || '');
        const extraInfo = item.color ? `Color: ${item.color}` : '';
        rows.push([listName, itemId, itemLabel, extraInfo]);
      });
    }
  });
  if (rows.length > 0) {
    sh.getRange(3, 1, rows.length, headers.length).setValues(rows);
  }
  autoFitAllColumns_(sh);
  
  const listCount = Object.keys(listsData).length;
  toast_(`[OK] Lists: ${listCount} lists, ${rows.length} items total`);
}

/* =====================================================
 * Test API Connection
 * ===================================================== */
function testApiConnection() {
  try {
    const { id, auth } = getCreds_();
    Logger.log(`[AUTH] Using HiBob service user: ${id}`);
    
    const url = `${BASE}/v1/company/people/fields`;
    const resp = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: { 
        Authorization: `Basic ${auth}`, 
        Accept: 'application/json' 
      }
    });
    
    const code = resp.getResponseCode();
    const text = resp.getContentText();
    
    if (code === 0) {
      SpreadsheetApp.getUi().alert(
        '[ERROR] Connection Failed',
        `Could not connect to HiBob API.\n\n` +
        `Possible causes:\n` +
        ` Network connectivity issues\n` +
        ` Invalid BASE URL\n` +
        ` Service blocked\n\n` +
        `Current BASE URL: ${BASE}\n\n` +
        `Check the Apps Script logs for details.`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }
    
    if (code >= 500) {
      SpreadsheetApp.getUi().alert(
        '[ERROR] Server Error',
        `HiBob API returned server error.\n\n` +
        `HTTP Status: ${code}\n\n` +
        `This is typically a temporary issue.\n` +
        `Please try again in a few moments.`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }
    
    if (code >= 400 && code < 500) {
      SpreadsheetApp.getUi().alert(
        '[ERROR] Authentication or Access Error',
        `Could not authenticate with HiBob API.\n\n` +
        `Possible causes:\n` +
        ` Invalid credentials\n` +
        ` Authentication failed (check credentials)\n` +
        ` Service user lacks permissions\n\n` +
        `Current BASE URL: ${BASE}\n` +
        `HTTP Status: ${code}\n\n` +
        `Check the Apps Script logs for details.`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }
    
    if (code === 200) {
      try {
        const data = JSON.parse(text);
        SpreadsheetApp.getUi().alert(
          '[OK] Connection Successful!',
          `Successfully connected to HiBob API.\n\n` +
          `Service User: ${id}\n` +
          `Base URL: ${BASE}\n` +
          `Fields Retrieved: ${Array.isArray(data) ? data.length : 'unknown'}\n\n` +
          `You can now use "Pull Fields", "Pull Lists", etc.`,
          SpreadsheetApp.getUi().ButtonSet.OK
        );
      } catch (e) {
        SpreadsheetApp.getUi().alert(
          '[WARN] Parse Error',
          `API responded with 200 but JSON parse failed.\n\n${e.message}\n\nCheck logs for details.`,
          SpreadsheetApp.getUi().ButtonSet.OK
        );
      }
    } else if (code === 401) {
      SpreadsheetApp.getUi().alert(
        '[ERROR] Authentication Failed',
        `HTTP 401 Unauthorized\n\n` +
        `Your service user credentials are incorrect.\n\n` +
        `Run: setBobServiceUser("id", "token") with correct credentials.`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } else if (code === 403) {
      SpreadsheetApp.getUi().alert(
        '[ERROR] Access Forbidden',
        `HTTP 403 Forbidden\n\n` +
        `Service user lacks required permissions.\n\n` +
        `Check HiBob admin settings for service user permissions.`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } else {
      SpreadsheetApp.getUi().alert(
        '[ERROR] Unexpected Response',
        `HTTP ${code}\n\n${text.slice(0, 500)}`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    }
    
  } catch (e) {
    SpreadsheetApp.getUi().alert(
      '[ERROR] Connection Failed',
      `Error: ${e.message}\n\nCheck Apps Script logs for details.`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    Logger.log('Connection test error: ' + e);
  }
}

// ============================================================================
// EMPLOYEE PULL FUNCTIONS
// ============================================================================

function setupAndPullEmployees() {
  const { auth } = getCreds_();
  const sh = getOrCreateSheet_(SHEET_EMPLOYEES);
  
  sh.clear();
  sh.clearNotes();
  
  try {
    const filter = sh.getFilter();
    if (filter) filter.remove();
  } catch (e) {}
  
  const lastRow = sh.getMaxRows();
  const lastCol = sh.getMaxColumns();
  if (lastRow > 0 && lastCol > 0) {
    sh.getRange(1, 1, lastRow, lastCol).clearDataValidations();
  }

  const listMap = buildListNameMap_();
  const siteOptions = listMap['site'] ? Object.values(listMap['site']).map(v => v.label).filter(Boolean) : [];
  const locationOptions = listMap['root.field_1696948109629'] ? Object.values(listMap['root.field_1696948109629']).map(v => v.label).filter(Boolean) : [];
  const statusOptions = ['Active', 'Inactive'];
  
  sh.getRange('A1').setValue('Employee Data - Filters & Configuration')
    .setBackground(CONFIG.COLORS.HEADER)
    .setFontColor(CONFIG.COLORS.HEADER_TEXT)
    .setFontWeight('bold')
    .setFontSize(14);
  sh.getRange('A1:H1').mergeAcross();

  sh.getRange('A2').setValue('Configure filters below, then data will load at row 8')
    .setFontStyle('italic')
    .setFontColor('#666666');
  sh.getRange('A2:H2').mergeAcross();

  sh.getRange('A3').setValue('Employment Status *').setFontWeight('bold');
  const statusCell = sh.getRange('B3');
  statusCell.setValue('Active');
  formatRequiredInput_(statusCell, 'Active = current employees | Inactive = terminated employees');
  statusCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(statusOptions, true)
    .setAllowInvalid(false)
    .build());

  sh.getRange('A4').setValue('Site (optional)');
  formatOptionalInput_(sh.getRange('B4'), 'Leave empty to include all sites');
  if (siteOptions.length > 0) {
    sh.getRange('B4').setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['', ...siteOptions], true)
      .setAllowInvalid(true)
      .build());
  }

  sh.getRange('A5').setValue('Location (optional)');
  formatOptionalInput_(sh.getRange('B5'), 'Leave empty to include all locations');
  if (locationOptions.length > 0) {
    sh.getRange('B5').setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['', ...locationOptions], true)
      .setAllowInvalid(true)
      .build());
  }

  sh.getRange('A6').setValue('[TIP] Select Active or Inactive status. Leave Site/Location blank to include all.')
    .setFontStyle('italic')
    .setFontColor('#E67C73')
    .setBackground('#FFF3CD');
  sh.getRange('A6:H6').mergeAcross();

  const headers = ['Bob ID', 'CIQ ID', 'Employee Name', 'Site', 'Location', 'Employment Status', 'Employment Type', 'Date of Hire'];
  sh.getRange(7, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow_(sh, 7, headers.length);
  
  sh.setFrozenRows(7);
  pullEmployeesData_(sh, auth);
}

function pullEmployees() {
  const { auth } = getCreds_();
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_EMPLOYEES);
  
  if (!sh) {
    throw new Error('Employees sheet not found. Run "3. Pull Employees" from SETUP menu first.');
  }
  
  const headerCheck = sh.getRange('A7').getValue();
  if (!headerCheck || headerCheck !== 'Bob ID') {
    throw new Error('Employees sheet not set up properly. Run "3. Pull Employees" from SETUP menu to set up first.');
  }
  
  try {
    const filter = sh.getFilter();
    if (filter) filter.remove();
  } catch (e) {}
  
  const lastRow = sh.getLastRow();
  if (lastRow > 7) {
    sh.getRange(8, 1, lastRow - 7, sh.getMaxColumns()).clearContent();
  }
  
  pullEmployeesData_(sh, auth);
}

function pullEmployeesData_(sh, auth) {
  const filterStatus = normalizeBlank_(sh.getRange('B3').getValue());
  const filterSite = normalizeBlank_(sh.getRange('B4').getValue());
  const filterLocation = normalizeBlank_(sh.getRange('B5').getValue());

  if (!filterStatus) {
    throw new Error('Employment Status is required (row 3).');
  }

  const showInactive = /^inactive$/i.test(filterStatus);
  const searchBody = { showInactive: showInactive, humanReadable: 'REPLACE' };

  const url = `${BASE}/v1/people/search`;
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    muteHttpExceptions: true,
    headers: { 
      Authorization: `Basic ${auth}`, 
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(searchBody)
  });

  const code = resp.getResponseCode();
  const text = resp.getContentText();
  
  if (code !== 200) {
    throw new Error(`Failed to fetch employees (${code}): ${text.slice(0,500)}`);
  }
  
  if (text.trim().toLowerCase().startsWith('<!doctype') || text.trim().toLowerCase().startsWith('<html')) {
    throw new Error(`API returned HTML instead of JSON. This usually means authentication failed or wrong endpoint.\n\nHTTP ${code}\n\nResponse preview: ${text.slice(0,300)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (parseError) {
    throw new Error(`Failed to parse API response as JSON.\n\nHTTP ${code}\n\nResponse preview: ${text.slice(0,500)}\n\nParse error: ${parseError.message}`);
  }
  const employees = data.employees || [];
  
  let filteredEmployees = employees;
  
  if (filterSite) {
    filteredEmployees = filteredEmployees.filter(emp => {
      const siteVal = getVal_(emp, 'work.site') || getVal_(emp, 'work.siteId') || '';
      return String(siteVal).toLowerCase() === filterSite.toLowerCase();
    });
  }
  
  if (filterLocation) {
    filteredEmployees = filteredEmployees.filter(emp => {
      let locVal = '';
      if (emp.custom && emp.custom.field_1696948109629) {
        locVal = emp.custom.field_1696948109629;
      } else {
        locVal = getVal_(emp, 'custom.field_1696948109629') || getVal_(emp, 'root.field_1696948109629') || '';
      }
      return String(locVal).toLowerCase() === filterLocation.toLowerCase();
    });
  }

  const rows = [];
  filteredEmployees.forEach(emp => {
    const bobId = safe(emp.id || getVal_(emp, 'root.id'));
    const ciqId = safe(getVal_(emp, 'work.employeeIdInCompany') || '');
    
    let displayName = '';
    if (emp.fullName) {
      displayName = emp.fullName;
    } else if (emp.displayName) {
      displayName = emp.displayName;
    } else {
      const first = getVal_(emp, 'root.firstName') || '';
      const last = getVal_(emp, 'root.surname') || '';
      displayName = (first + ' ' + last).trim();
    }
    
    const siteVal = getVal_(emp, 'work.site') || getVal_(emp, 'work.siteId') || '';
    
    let locationVal = '';
    if (emp.custom && emp.custom.field_1696948109629) {
      locationVal = emp.custom.field_1696948109629;
    } else {
      locationVal = getVal_(emp, 'custom.field_1696948109629') || getVal_(emp, 'root.field_1696948109629') || '';
    }
    
    let empStatus = 'Unknown';
    const isActive = getVal_(emp, 'work.isActive');
    if (isActive === true) {
      empStatus = 'Active';
    } else if (isActive === false) {
      empStatus = 'Inactive';
    } else {
      empStatus = showInactive ? 'Inactive' : 'Active';
    }
    
    let employmentTypeVal = getVal_(emp, 'payroll.employment.type') || getVal_(emp, 'work.payrollEmploymentType') || getVal_(emp, 'work.employmentType') || '';
    const hireDate = safe(getVal_(emp, 'work.startDate') || '');

    rows.push([bobId, ciqId, displayName, siteVal, locationVal, empStatus, employmentTypeVal, hireDate]);
  });

  if (rows.length === 0) {
    let message = 'No employees found matching filters';
    if (!showInactive && employees.length === 0) {
      message = 'No active employees found. Try selecting "Inactive" status to see terminated employees.';
    } else if (employees.length > 0 && rows.length === 0) {
      message = `Found ${employees.length} employees but none matched Site/Location filters. Check filter values.`;
    }
    sh.getRange(8, 1, 1, 8).setValues([[message, '', '', '', '', '', '', '']]);
    toast_(message);
  } else {
    sh.getRange(8, 1, rows.length, 8).setValues(rows);
    toast_(`[OK] Employees: ${rows.length} rows pulled from HiBob`);
  }

  autoFitAllColumns_(sh);
  
  try {
    if (!sh.getFilter()) {
      const lastRow = sh.getLastRow();
      const lastCol = sh.getLastColumn();
      if (lastRow >= 7 && lastCol > 0) {
        sh.getRange(7, 1, lastRow - 6, lastCol).createFilter();
      }
    }
  } catch (e) {}
}

// ============================================================================
// FIELD UPLOADER - Setup and Selection
// ============================================================================

// REMOVED: setupUploader() function
// This was redundant because showFieldSelector() clears the sheet and builds everything from scratch.
// The old setupUploader() would create an instruction sheet, then showFieldSelector() would wipe it.
// Now menu item "4. Setup Field Uploader" directly calls showFieldSelector().

function showFieldSelector() {
  const ul = getOrCreateSheet_(SHEET_UPLOADER);
  
  // Clear sheet
  ul.clear();
  ul.clearNotes();
  
  // Title
  ul.getRange('A1').setValue('Field Uploader - Update Single Field for Multiple Employees')
    .setBackground(CONFIG.COLORS.HEADER)
    .setFontColor(CONFIG.COLORS.HEADER_TEXT)
    .setFontWeight('bold')
    .setFontSize(14);
  ul.getRange('A1:C1').mergeAcross();
  
  // Reserve D1:I1 for hidden field data storage (not merged!)
  
  // Search Box (always available, no step label needed)
  ul.getRange('A2').setValue('Search Field:').setFontWeight('bold').setFontSize(11);
  const searchCell = ul.getRange('B2');
  searchCell.setValue('')
    .setBackground('#FFFFFF')
    .setBorder(true, true, true, true, false, false, '#4285F4', SpreadsheetApp.BorderStyle.SOLID_MEDIUM)
    .setFontSize(12)
    .setNote('Type field name (e.g., "Q2", "Site", "Department") then press Enter or click Search');
  
  const searchBtnCell = ul.getRange('C2');
  searchBtnCell.setValue('🔍 Search')
    .setBackground('#4285F4')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(11)
    .setNote('Click to search');
  
  // Selected Field Display
  ul.getRange('A3').setValue('Selected Field:').setFontWeight('bold');
  ul.getRange('B3').setValue('(Search for a field first)').setFontStyle('italic').setFontColor('#999999');
  
  // Upload Table (will be built when field is selected)
  ul.getRange('A4').setValue('Upload Table').setFontWeight('bold').setFontSize(12);
  ul.getRange('A4:H4').mergeAcross();
  
  ul.getRange('A5').setValue('(Table will appear after field is selected)').setFontStyle('italic').setFontColor('#999999');
  ul.getRange('A5:H5').mergeAcross();
  
  ul.setFrozenRows(1);
  autoFitAllColumns_(ul);
  
  // Set active cell to search box
  SpreadsheetApp.getActive().setActiveSheet(ul);
  SpreadsheetApp.getActive().setActiveRange(searchCell);
  
  toast_('✅ Ready! Type in B2 and press Enter or click Search.');
}

function onEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    const range = e.range;
    
    if (sheet.getName() !== SHEET_UPLOADER) return;
    
  // Manual search trigger: Click on search button (C2)
  if (range.getRow() === 2 && range.getColumn() === 3) {
    const searchTerm = sheet.getRange('B2').getValue();
    if (searchTerm && String(searchTerm).trim().length >= 2) {
      searchAndDisplayFields(searchTerm);
    } else {
      SpreadsheetApp.getUi().alert('Please enter a search term (2+ characters) in cell B2 first.');
    }
    return;
  }
  
  // Auto-search when user types in B2 and presses Enter (or leaves cell)
  if (range.getRow() === 2 && range.getColumn() === 2) {
      const searchTerm = range.getValue();
      if (searchTerm && String(searchTerm).trim().length >= 2) {
        // Trigger search after a brief delay
        Utilities.sleep(300);
        const currentValue = sheet.getRange('B2').getValue();
        if (currentValue === searchTerm) {
          searchAndDisplayFields(searchTerm);
        }
    } else if (!searchTerm || String(searchTerm).trim().length === 0) {
    // Clear selected field if search is cleared
    sheet.getRange('B3').setValue('(Search for a field first)').setFontStyle('italic').setFontColor('#999999');
    sheet.getRange('C3').setValue('');
    sheet.getRange('D3').setValue('');
    // Clear upload table
    sheet.getRange('A4:H1000').clearContent().clearFormat();
    sheet.getRange('A4').setValue('Upload Table').setFontWeight('bold').setFontSize(12);
    sheet.getRange('A4:H4').mergeAcross();
    sheet.getRange('A5').setValue('(Table will appear after field is selected)').setFontStyle('italic').setFontColor('#999999');
    sheet.getRange('A5:H5').mergeAcross();
    // Clear stored field info
    sheet.getRange('D1:I1').clearContent().clearFormat();
    }
      return;
    }
    
    // No need for click detection - field is auto-selected on search!
  } catch (error) {
    // Silently handle errors in onEdit to avoid disrupting user workflow
    Logger.log('onEdit error: ' + error.message);
  }
}

function searchAndDisplayFields(searchTerm) {
  const ul = getOrCreateSheet_(SHEET_UPLOADER);
  const searchTermLower = String(searchTerm || '').toLowerCase().trim();
  
  if (!searchTermLower) {
    SpreadsheetApp.getUi().alert('Please enter a search term in cell B3.');
    return;
  }
  
  // Get all fields
  const allFields = getFieldsForSelector();
  
  // Filter fields - PRIORITIZE column B (name) first, then other columns
  const matchingFields = allFields.filter(field => {
    const name = (field.name || '').toLowerCase();
    const type = (field.type || '').toLowerCase();
    const path = (field.jsonPath || '').toLowerCase();
    
    // Primary search: column B (name) - most important
    if (name.includes(searchTermLower)) {
      return true;
    }
    // Secondary: type and path
    return type.includes(searchTermLower) || path.includes(searchTermLower);
  });
  
  // Sort results: exact name matches first, then partial name matches, then others
  matchingFields.sort((a, b) => {
    const aName = (a.name || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();
    const term = searchTermLower;
    
    // Exact match first
    if (aName === term && bName !== term) return -1;
    if (bName === term && aName !== term) return 1;
    
    // Starts with term
    if (aName.startsWith(term) && !bName.startsWith(term)) return -1;
    if (bName.startsWith(term) && !aName.startsWith(term)) return 1;
    
    // Contains in name
    if (aName.includes(term) && !bName.includes(term)) return -1;
    if (bName.includes(term) && !aName.includes(term)) return 1;
    
    // Alphabetical
    return aName.localeCompare(bName);
  });
  
  if (matchingFields.length === 0) {
    ul.getRange('B3').setValue('No fields found matching "' + searchTerm + '"')
      .setBackground(CONFIG.COLORS.WARNING)
      .setFontStyle('normal')
      .setFontColor('#000000');
    ul.getRange('C3').setValue('');
    ul.getRange('D3').setValue('');
    // Clear upload table
    ul.getRange('A4:H1000').clearContent().clearFormat();
    ul.getRange('A4').setValue('Upload Table').setFontWeight('bold').setFontSize(12);
    ul.getRange('A4:H4').mergeAcross();
    ul.getRange('A5').setValue('(Table will appear after field is selected)').setFontStyle('italic').setFontColor('#999999');
    ul.getRange('A5:H5').mergeAcross();
    // Clear stored field info
    ul.getRange('D1:I1').clearContent().clearFormat();
    toast_('No matching fields found. Try a different search term.');
    return;
  }
  
  // Always auto-select the first result - no clicking needed!
  if (matchingFields.length > 0) {
    const selectedField = matchingFields[0];
    selectFieldFromList(selectedField.name);
    
    // Show info about other matches if there are more
    if (matchingFields.length > 1) {
      toast_('✓ Selected: ' + selectedField.name + ' (first of ' + matchingFields.length + ' matches). Start entering data below!');
    } else {
      toast_('✓ Selected: ' + selectedField.name + '. Start entering data below!');
    }
  }
}

function selectFieldFromList(fieldName) {
  try {
    const ul = getOrCreateSheet_(SHEET_UPLOADER);
    
    // Find the field in the results - try exact match first, then partial
    const allFields = getFieldsForSelector();
    let field = allFields.find(f => f.name === fieldName);
    
    // If exact match not found, try finding by checking the displayed row
    if (!field) {
      // Check row 15 and 16 for the field
      for (let r = 15; r <= 16; r++) {
        const rowName = ul.getRange(r, 1).getValue();
        if (rowName === fieldName) {
          // Get the jsonPath from column B
          const jsonPath = ul.getRange(r, 2).getValue();
          if (jsonPath) {
            // Find field by jsonPath
            field = allFields.find(f => f.jsonPath === jsonPath);
            if (field) break;
          }
        }
      }
    }
    
    if (!field) {
      SpreadsheetApp.getUi().alert('Field not found: ' + fieldName + '\n\nPlease search again and click a field name.');
      return;
    }
    
    // Extract category/field identifier from field ID
    // Example: custom.category_1745852314013.field_1762762787179 -> category_1745852314013.field_1762762787179
    let categoryId = '';
    if (field.id) {
      // Remove 'custom.' prefix if present
      categoryId = String(field.id).replace(/^custom\./, '');
    }
    
    // For list types, fetch the correct list values based on category/field identifier
    let listName = field.listName || '';
    let listValues = [];
    
    if (field.type === 'list' || listName) {
      // Try to get list values from Lists sheet using the category/field identifier
      listValues = getListValuesByFieldId_(categoryId || field.id);
      
      // If no values found by field ID, try using listName
      if (listValues.length === 0 && listName) {
        const listMap = buildListLabelToId_(listName);
        listValues = Object.keys(listMap).filter(k => !k.toLowerCase().includes('id'));
      }
    }
    
    // Store field info in hidden cells (D1-H1)
    ul.getRange('D1').setValue(field.name);
    ul.getRange('E1').setValue(field.jsonPath);
    ul.getRange('F1').setValue(field.id);
    ul.getRange('G1').setValue(field.type);
    ul.getRange('H1').setValue(listName || '');
    
    // Store category ID in I1 for reference
    ul.getRange('I1').setValue(categoryId);
    
    ul.getRange('D1:I1')
      .setBackground('#E8F0FE')
      .setFontWeight('bold')
      .setBorder(true, true, true, true, false, false, '#4285F4', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    
    // Update search cell to show selected field
    ul.getRange('B2').setValue(field.name);
    
    // Update selected field display (row 3)
    ul.getRange('A3').setValue('Selected Field:').setFontWeight('bold');
    ul.getRange('B3').setValue(field.name)
      .setBackground(CONFIG.COLORS.SUCCESS)
      .setFontWeight('bold')
      .setFontColor('#000000');
    ul.getRange('C3').setValue('(' + field.jsonPath + ')')
      .setFontStyle('italic')
      .setFontSize(10)
      .setFontColor('#666666');
    
    if (listValues.length > 0) {
      ul.getRange('D3').setValue('📋 ' + listValues.length + ' list values')
        .setFontSize(10)
        .setFontColor('#4285F4');
    }
    
    // Build Upload Table
    ul.getRange('A4').setValue('Upload Table').setFontWeight('bold').setFontSize(12);
    ul.getRange('A4:H4').mergeAcross();
    
    // Data headers
    const dataHeaders = ['CIQ ID', 'New Value', 'Bob ID', 'Field Path', 'Status', 'Code', 'Error', 'Verified Value'];
    ul.getRange(5, 1, 1, dataHeaders.length).setValues([dataHeaders]);
    formatHeaderRow_(ul, 5, dataHeaders.length);
    
    // Add instructions for data entry
    ul.getRange('A6').setValue('Paste CIQ IDs in column A, new values in column B (starting row 7)')
      .setFontStyle('italic')
      .setFontColor('#666666')
      .setFontSize(10);
    ul.getRange('A6:H6').mergeAcross();
    
    // Set frozen rows
    ul.setFrozenRows(5);
    
    // Focus on data entry area
    SpreadsheetApp.getActive().setActiveRange(ul.getRange('A7'));
    
    toast_('✓ Selected: ' + field.name + (listValues.length > 0 ? ' (' + listValues.length + ' list values)' : ''));
    
  } catch (error) {
    SpreadsheetApp.getUi().alert('Error selecting field: ' + error.message);
  }
}

/**
 * Get list values from Lists sheet by field identifier
 * @param {string} fieldId - Field identifier (e.g., "category_1745852314013.field_1762762787179")
 * @returns {Array<string>} Array of list value labels
 */
function getListValuesByFieldId_(fieldId) {
  if (!fieldId) return [];
  
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.LISTS_SHEET);
  if (!sh) return [];
  
  const data = sh.getDataRange().getValues();
  if (data.length < 3) return [];
  
  // Look for field identifier in column A (index 0)
  const fieldIdStr = String(fieldId).trim();
  const listValues = [];
  
  // Check if column A contains field identifiers
  // Column C (index 2) should contain the list values
  for (var r = 2; r < data.length; r++) {
    const colA = String(data[r][0] || '').trim();
    
    // Match field identifier (exact or partial match)
    if (colA === fieldIdStr || colA.indexOf(fieldIdStr) >= 0 || fieldIdStr.indexOf(colA) >= 0) {
      const listValue = String(data[r][2] || '').trim(); // Column C
      if (listValue) {
        listValues.push(listValue);
      }
    }
  }
  
  // Remove duplicates
  return [...new Set(listValues)];
}

/**
 * Build mapping of list label to ID using field identifier
 * @param {string} fieldId - Field identifier (e.g., "category_1745852314013.field_1762762787179")
 * @returns {Object} Map of label -> ID (both original and lowercase)
 */
function buildListLabelToIdByFieldId_(fieldId) {
  if (!fieldId) return {};
  
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.LISTS_SHEET);
  if (!sh) return {};
  
  const data = sh.getDataRange().getValues();
  if (data.length < 3) return {};
  
  const fieldIdStr = String(fieldId).trim();
  const map = {};
  
  // Check header row to understand structure
  const header = data[1] ? data[1].map(function(x) { return String(x || '').trim(); }) : [];
  const hasStandardStructure = header.indexOf('listName') >= 0 && header.indexOf('valueId') >= 0 && header.indexOf('valueLabel') >= 0;
  
  if (hasStandardStructure) {
    // Standard structure: listName, valueId, valueLabel columns
    const iList = header.indexOf('listName');
    const iValId = header.indexOf('valueId');
    const iValLbl = header.indexOf('valueLabel');
    
    for (var r = 2; r < data.length; r++) {
      const colA = String(data[r][0] || '').trim();
      
      // Match field identifier in column A
      if (colA === fieldIdStr || colA.indexOf(fieldIdStr) >= 0 || fieldIdStr.indexOf(colA) >= 0) {
        const valId = String(data[r][iValId] || '').trim();
        const valLbl = String(data[r][iValLbl] || '').trim();
        
        if (valLbl && valId) {
          map[valLbl] = valId;
          map[valLbl.toLowerCase()] = valId;
        }
      }
    }
  } else {
    // Alternative structure: Column A = field identifier, Column C = list values
    // Format: "265436380 HH" where first part is ID, second is label
    for (var r = 2; r < data.length; r++) {
      const colA = String(data[r][0] || '').trim();
      const colC = String(data[r][2] || '').trim();
      
      // Match field identifier in column A
      if (colA === fieldIdStr || colA.indexOf(fieldIdStr) >= 0 || fieldIdStr.indexOf(colA) >= 0) {
        if (colC) {
          // Parse "265436380 HH" format: ID is first part, label is second part
          const parts = colC.split(/\s+/);
          if (parts.length >= 2) {
            const valId = parts[0];
            const valLbl = parts.slice(1).join(' ');
            
            if (valLbl && valId) {
              map[valLbl] = valId;
              map[valLbl.toLowerCase()] = valId;
            }
          } else {
            // If no space, treat entire value as both ID and label
            map[colC] = colC;
            map[colC.toLowerCase()] = colC;
          }
        }
      }
    }
  }
  
  return map;
}

function getFieldsForSelector() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.META_SHEET);
  if (!sh) {
    throw new Error('Sheet "' + CONFIG.META_SHEET + '" not found. Run "1. Pull Fields" first.');
  }
  
  const data = sh.getDataRange().getValues();
  if (data.length < 3) {
    throw new Error('Sheet "' + CONFIG.META_SHEET + '" is empty. Run "1. Pull Fields" first.');
  }
  
  // Header is on row 2 (index 1)
  const header = data[1].map(function(x) { return String(x || '').trim(); });
  const iId = header.indexOf('id');
  const iName = header.indexOf('name');
  const iPath = header.indexOf('jsonPath');
  const iType = header.indexOf('type');
  const iCalc = header.indexOf('calculated');
  const iTypeData = header.indexOf('typeData (raw JSON)');
  
  const fields = [];
  // Data starts at row 3 (index 2)
  for (var r = 2; r < data.length; r++) {
    var row = data[r];
    
    // Skip calculated fields and object types early
    const calculated = iCalc >= 0 ? String(row[iCalc] || '').trim() : '';
    const fieldType = iType >= 0 ? String(row[iType] || '').trim() : '';
    
    if (calculated === 'true' || fieldType === 'object') {
      continue;
    }
    
    // Only parse typeData if we need listName (for list types)
    var listName = '';
    if (iTypeData >= 0 && row[iTypeData]) {
      try {
        const typeData = JSON.parse(String(row[iTypeData]));
        if (typeData && typeData.listName) {
          listName = String(typeData.listName);
        }
      } catch (e) {
        // If JSON parse fails, skip it - not a list type
      }
    }
    
    fields.push({
      id: iId >= 0 ? safe(row[iId]) : '',
      name: iName >= 0 ? safe(row[iName]) : '',
      jsonPath: iPath >= 0 ? safe(row[iPath]) : '',
      type: fieldType,
      listName: listName
    });
  }
  
  return fields;
}

function setSelectedField(fieldName) {
  try {
    const fields = readFields_();
    const field = fields.find(f => f.name === fieldName);
    
    if (!field) {
      throw new Error(`Field not found: ${fieldName}`);
    }

    const ul = getOrCreateSheet_(SHEET_UPLOADER);
    
    ul.getRange('D1').setValue(field.name);
    ul.getRange('E1').setValue(field.jsonPath);
    ul.getRange('F1').setValue(field.id);
    ul.getRange('G1').setValue(field.type);
    ul.getRange('H1').setValue(field.typeData?.listName || '');
    
    ul.getRange('D1:H1')
      .setBackground('#E8F0FE')
      .setFontWeight('bold')
      .setBorder(true, true, true, true, false, false, '#4285F4', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    
    SpreadsheetApp.getActive().setActiveSheet(ul);
    SpreadsheetApp.getActive().setActiveRange(ul.getRange('A8'));
    
    toast_(`✓ Selected: ${field.name}`);
    
    return `Selected field: ${field.name} (${field.jsonPath})`;
  } catch (error) {
    throw error;
  }
}

/**
 * TEST FUNCTION - Run this from Apps Script to verify field selection works
 * This will select "Site" field if it exists
 */
function testFieldSelection() {
  try {
    Logger.log('=== Testing Field Selection ===');
    
    // Test 1: Check if readFields_ works
    Logger.log('Test 1: Reading fields...');
    const fields = readFields_();
    Logger.log(`Found ${fields.length} fields`);
    
    if (fields.length === 0) {
      throw new Error('No fields found! Run "Pull Fields" first.');
    }
    
    // Test 2: List first 10 field names
    Logger.log('Test 2: First 10 fields:');
    fields.slice(0, 10).forEach(f => {
      Logger.log(`  - ${f.name} (${f.type})`);
    });
    
    // Test 3: Try to select "Site" field
    Logger.log('Test 3: Attempting to select "Site" field...');
    const siteField = fields.find(f => f.name === 'Site');
    
    if (!siteField) {
      Logger.log('WARNING: "Site" field not found. Using first available field instead.');
      const result = setSelectedField(fields[0].name);
      Logger.log(`SUCCESS: ${result}`);
    } else {
      const result = setSelectedField('Site');
      Logger.log(`SUCCESS: ${result}`);
    }
    
    // Test 4: Verify it was written to sheet
    Logger.log('Test 4: Verifying sheet values...');
    const ul = SpreadsheetApp.getActive().getSheetByName(SHEET_UPLOADER);
    const fieldName = ul.getRange('D1').getValue();
    const jsonPath = ul.getRange('E1').getValue();
    Logger.log(`  Field Name in D1: ${fieldName}`);
    Logger.log(`  JSON Path in E1: ${jsonPath}`);
    
    Logger.log('=== ALL TESTS PASSED ===');
    SpreadsheetApp.getUi().alert(
      '✓ Test Successful',
      `Field selection is working correctly!\n\n` +
      `Field: ${fieldName}\n` +
      `Path: ${jsonPath}\n\n` +
      `You can now use "Select Field to Update" dialog.`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
  } catch (error) {
    Logger.log(`=== TEST FAILED ===`);
    Logger.log(`Error: ${error.message}`);
    Logger.log(`Stack: ${error.stack}`);
    SpreadsheetApp.getUi().alert(
      '✗ Test Failed',
      `Error: ${error.message}\n\n` +
      `Check View > Executions for details.`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    throw error;
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateUploadData() {
  const ul = getOrCreateSheet_(SHEET_UPLOADER);
  
  const fieldName = normalizeBlank_(ul.getRange('D1').getValue());
  const fieldPath = normalizeBlank_(ul.getRange('E1').getValue());
  const selectedFieldDisplay = normalizeBlank_(ul.getRange('B3').getValue());
  
  if (!fieldName || !fieldPath) {
    // Check if field is displayed in row 3 but not stored
    if (selectedFieldDisplay && selectedFieldDisplay !== '(Search for a field first)') {
      // Try to re-select the field from the display
      const jsonPathDisplay = ul.getRange('C3').getValue();
      if (jsonPathDisplay) {
        try {
          selectFieldFromList(selectedFieldDisplay);
          // Re-read after selection
          const newFieldName = normalizeBlank_(ul.getRange('D1').getValue());
          const newFieldPath = normalizeBlank_(ul.getRange('E1').getValue());
          if (newFieldName && newFieldPath) {
            // Field is now selected, continue validation
          } else {
            throw new Error(' Field selection failed.\n\nPlease run "Setup Field Uploader" again and search for the field.');
          }
        } catch (e) {
          throw new Error(' No field selected!\n\n' +
            'Selected field display shows: ' + selectedFieldDisplay + '\n\n' +
            'Please run "Setup Field Uploader" again and search for the field.');
        }
      } else {
        throw new Error(' No field selected!\n\n' +
          'Please:\n' +
          '1. Run "SETUP → 4. Setup Field Uploader"\n' +
          '2. Search for a field in B2\n' +
          '3. Press Enter or click "🔍 Search"');
      }
    } else {
      throw new Error(' No field selected!\n\n' +
        'Please:\n' +
        '1. Run "SETUP → 4. Setup Field Uploader"\n' +
        '2. Search for a field in B2\n' +
        '3. Press Enter or click "🔍 Search"\n' +
        '4. Upload table will appear automatically');
    }
  }
  
  const lastRow = ul.getLastRow();
  if (lastRow < 7) {
    throw new Error(' No data to validate!\n\nAdd employee CIQ IDs and new values starting at row 7.');
  }
  
  const data = ul.getRange(7, 1, lastRow - 6, 2).getValues();
  
  let emptyRows = 0;
  let validRows = 0;
  let issues = [];
  
  data.forEach((row, i) => {
    const ciq = normalizeBlank_(row[0]);
    const newVal = normalizeBlank_(row[1]);
    const rowNum = i + 7;
    
    if (!ciq && !newVal) {
      emptyRows++;
      return;
    }
    
    if (!ciq) {
      issues.push(`Row ${rowNum}: Missing CIQ ID`);
      return;
    }
    
    if (newVal === '') {
      issues.push(`Row ${rowNum}: Missing new value`);
      return;
    }
    
    validRows++;
  });
  
  let msg = ` Validation Results:\n\n`;
  msg += ` Valid rows: ${validRows}\n`;
  msg += ` Empty rows: ${emptyRows}\n`;
  
  if (issues.length > 0) {
    msg += `\n Issues found (${issues.length}):\n`;
    msg += issues.slice(0, 10).join('\n');
    if (issues.length > 10) {
      msg += `\n... and ${issues.length - 10} more issues`;
    }
    
    SpreadsheetApp.getUi().alert(' Validation Issues', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } else {
    msg += `\n All data looks good!\n\nReady to upload ${validRows} updates.`;
    SpreadsheetApp.getUi().alert(' Validation Passed', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// ============================================================================
// UPLOAD FUNCTIONS
// ============================================================================

function runQuickUpload() {
  const ul = getOrCreateSheet_(SHEET_UPLOADER);
  const { auth } = getCreds_();
  
  const fieldName = normalizeBlank_(ul.getRange('D1').getValue());
  const fieldPath = normalizeBlank_(ul.getRange('E1').getValue());
  const listName = normalizeBlank_(ul.getRange('H1').getValue());
  
  if (!fieldName || !fieldPath) {
    throw new Error(' No field selected. Use "Select Field to Update" first.');
  }
  
  const lastRow = ul.getLastRow();
  if (lastRow < 7) {
    throw new Error(' No data to upload. Add CIQ IDs and values starting at row 7.');
  }
  
  const dataRows = lastRow - 6;
  if (dataRows > 40) {
    const response = SpreadsheetApp.getUi().alert(
      ' Large Dataset Detected',
      `You have ${dataRows} rows.\n\n` +
      `Quick Upload is best for <40 rows.\n` +
      `For ${dataRows} rows, use "Batch Upload" instead.\n\n` +
      `Continue with Quick Upload anyway?`,
      SpreadsheetApp.getUi().ButtonSet.YES_NO
    );
    
    if (response !== SpreadsheetApp.getUi().Button.YES) {
      return;
    }
  }
  
  const data = ul.getRange(7, 1, dataRows, 2).getValues();
  const ciqToBobMap = buildCiqToBobMap_();
  
  // Get category/field identifier from I1 (stored during field selection)
  const categoryId = normalizeBlank_(ul.getRange('I1').getValue());
  
  let listMap = null;
  
  // Debug: Show what we're working with
  Logger.log(`🔍 Field: ${fieldPath}`);
  Logger.log(`🔍 Category ID (I1): "${categoryId}"`);
  Logger.log(`🔍 List Name (H1): "${listName}"`);
  
  // PRIORITY 1: Try listName first (shared lists across multiple fields)
  if (listName) {
    listMap = buildListLabelToId_(listName);
    Logger.log(`📋 List map by name "${listName}": ${Object.keys(listMap || {}).length} values`);
    if (listMap && Object.keys(listMap).length > 0) {
      Logger.log(`   Available values: ${Object.keys(listMap).filter(k => k === k.toUpperCase()).slice(0, 10).join(', ')}`);
    }
  } else {
    Logger.log(`⚠️ No listName found in H1 - will try field ID lookup`);
  }
  
  // PRIORITY 2: Try field-specific lookup if listName didn't work
  if ((!listMap || Object.keys(listMap).length === 0) && categoryId) {
    listMap = buildListLabelToIdByFieldId_(categoryId);
    Logger.log(`📋 List map by field ID "${categoryId}": ${Object.keys(listMap || {}).length} values`);
    if (listMap && Object.keys(listMap).length > 0) {
      Logger.log(`   Available values: ${Object.keys(listMap).filter(k => k === k.toUpperCase()).slice(0, 10).join(', ')}`);
    }
  }
  
  // PRIORITY 3: Try category-only lookup (for shared lists within a category)
  if ((!listMap || Object.keys(listMap).length === 0) && categoryId) {
    const categoryOnly = categoryId.split('.')[0];
    if (categoryOnly && categoryOnly !== categoryId) {
      Logger.log(`📋 Trying category-only lookup: "${categoryOnly}"`);
      listMap = buildListLabelToIdByFieldId_(categoryOnly);
      Logger.log(`📋 List map by category "${categoryOnly}": ${Object.keys(listMap || {}).length} values`);
      if (listMap && Object.keys(listMap).length > 0) {
        Logger.log(`   Available values: ${Object.keys(listMap).filter(k => k === k.toUpperCase()).slice(0, 10).join(', ')}`);
      }
    }
  }
  
  // Final check
  if (!listMap || Object.keys(listMap).length === 0) {
    Logger.log(`❌ CRITICAL: No list values found by any method!`);
    Logger.log(`   → Cell H1 (listName): "${listName}"`);
    Logger.log(`   → Cell I1 (categoryId): "${categoryId}"`);
    Logger.log(`   → Suggestion: Run "Bob → SETUP → 2. Pull Lists"`);
  }
  
  let ok = 0, skip = 0, fail = 0;
  
  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 7;
    const ciq = normalizeBlank_(data[i][0]);
    const rawNew = normalizeBlank_(data[i][1]);
    
    if (!ciq) continue;
    
    ul.getRange(rowNum, 5).setValue(' Processing...');
    SpreadsheetApp.flush();
    
    let bobId = ciqToBobMap[ciq];
    if (!bobId) {
      bobId = lookupBobIdFromApi_(auth, ciq);
    }
    
    if (!bobId) {
      writeUploaderResult_(ul, rowNum, 'FAILED', '', `CIQ ${ciq} not found`, '');
      fail++;
      continue;
    }
    
    ul.getRange(rowNum, 3).setValue(bobId);
    ul.getRange(rowNum, 4).setValue(fieldPath);
    
    let newVal = rawNew;
    if (listMap) {
      const hit = listMap[rawNew] || listMap[String(rawNew).toLowerCase()];
      if (hit) newVal = hit;
    }
    
    const body = buildPutBody_(fieldPath, newVal);
    const putUrl = `${BASE}/v1/people/${encodeURIComponent(bobId)}`;
    let code = 0, text = '';
    
    try {
      const resp = UrlFetchApp.fetch(putUrl, {
        method: 'put',
        muteHttpExceptions: true,
        headers: { 
          Authorization: `Basic ${auth}`, 
          Accept: 'application/json', 
          'Content-Type': 'application/json' 
        },
        payload: JSON.stringify(body)
      });
      code = resp.getResponseCode();
      text = resp.getContentText();
    } catch(e) { 
      code = 0; 
      text = String(e && e.message || e); 
    }
    
    if (code >= 200 && code < 300) {
      const verified = readBackField_(auth, bobId, fieldPath);
      writeUploaderResult_(ul, rowNum, 'COMPLETED', code, '', verified);
      ok++;
    } else if (code === 304) {
      const verified = readBackField_(auth, bobId, fieldPath);
      writeUploaderResult_(ul, rowNum, 'SKIP', code, 'Already correct', verified);
      skip++;
    } else if (code === 404) {
      writeUploaderResult_(ul, rowNum, 'FAILED', code, 'Bob API 404', '');
      fail++;
    } else {
      writeUploaderResult_(ul, rowNum, 'FAILED', code || '', (text||'').slice(0,200), '');
      fail++;
    }
    
    SpreadsheetApp.flush();
    Utilities.sleep(PUT_DELAY_MS);
  }
  
  let msg = ` Upload Complete!\n\n`;
  msg += ` Completed: ${ok}\n`;
  msg += ` Skipped: ${skip}\n`;
  msg += ` Failed: ${fail}`;
  
  SpreadsheetApp.getUi().alert('Upload Results', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function runBatchUpload() {
  const ul = getOrCreateSheet_(SHEET_UPLOADER);
  
  const fieldName = normalizeBlank_(ul.getRange('D1').getValue());
  const fieldPath = normalizeBlank_(ul.getRange('E1').getValue());
  
  if (!fieldName || !fieldPath) {
    throw new Error(' No field selected. Use "Select Field to Update" first.');
  }
  
  const lastRow = ul.getLastRow();
  if (lastRow < 7) {
    throw new Error(' No data to upload.');
  }
  
  const dataRows = lastRow - 6;
  const estimatedMinutes = Math.ceil(dataRows / BATCH_SIZE) * TRIGGER_INTERVAL;
  
  const response = SpreadsheetApp.getUi().alert(
    ' Start Batch Upload?',
    `This will upload ${dataRows} rows in batches of ${BATCH_SIZE}.\n\n` +
    `Estimated time: ~${estimatedMinutes} minutes\n\n` +
    `The upload will run automatically in the background.\n` +
    `You can close this spreadsheet and check progress later.\n\n` +
    `Continue?`,
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );
  
  if (response !== SpreadsheetApp.getUi().Button.YES) {
    return;
  }
  
  const props = PropertiesService.getScriptProperties();
  props.setProperty('BATCH_UPLOAD_STATE', JSON.stringify({
    nextRow: 7,
    fieldName: fieldName,
    fieldPath: fieldPath,
    startTime: new Date().toISOString(),
    lastBatchTime: new Date().toISOString(),
    stats: { completed: 0, skipped: 0, failed: 0 }
  }));
  
  createBatchTrigger();
  
  toast_(` Batch upload started! Check progress with " MONITORING  Check Batch Status"`);
}

function processBatch() {
  // Acquire lock to prevent multiple batches from running simultaneously
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(1000)) {
      Logger.log('⚠️ Previous batch still running, skipping this trigger');
      return; // Skip if another batch is already running
    }
  } catch(e) {
    Logger.log(`⚠️ Could not acquire lock: ${e}`);
    return;
  }
  
  try {
    const props = PropertiesService.getScriptProperties();
    const stateJson = props.getProperty('BATCH_UPLOAD_STATE');
    
    if (!stateJson) {
      lock.releaseLock();
      return;
    }
  
    const state = JSON.parse(stateJson);
    const ul = getOrCreateSheet_(SHEET_UPLOADER);
    const { auth } = getCreds_();
    
    const fieldPath = state.fieldPath;
    const listName = normalizeBlank_(ul.getRange('H1').getValue());
    
    const lastRow = ul.getLastRow();
    const endRow = Math.min(state.nextRow + BATCH_SIZE - 1, lastRow);
    
    if (state.nextRow > lastRow) {
      clearBatchUpload();
      clearUploadDataAfterBatch_(state.stats);
      lock.releaseLock();
      return;
    }
    
    const data = ul.getRange(state.nextRow, 1, endRow - state.nextRow + 1, 2).getValues();
    const ciqToBobMap = buildCiqToBobMap_();
    
    // Get category/field identifier from I1 (stored during field selection)
    const categoryId = normalizeBlank_(ul.getRange('I1').getValue());
    
      let listMap = null;
    
    // Debug: Show what we're working with
    Logger.log(`🔍 Field: ${fieldPath}`);
    Logger.log(`🔍 Category ID (I1): "${categoryId}"`);
    Logger.log(`🔍 List Name (H1): "${listName}"`);
    
    // PRIORITY 1: Try listName first (shared lists across multiple fields)
    // This is common for performance fields where one list is used by multiple period fields
    if (listName) {
      listMap = buildListLabelToId_(listName);
      Logger.log(`📋 List map by name "${listName}": ${Object.keys(listMap || {}).length} values found`);
      if (listMap && Object.keys(listMap).length > 0) {
        Logger.log(`   Available values: ${Object.keys(listMap).filter(k => k === k.toUpperCase()).slice(0, 10).join(', ')}`);
      }
    } else {
      Logger.log(`⚠️ No listName found in H1 - will try field ID lookup`);
    }
    
    // PRIORITY 2: Try field-specific lookup if listName didn't work
    if ((!listMap || Object.keys(listMap).length === 0) && categoryId) {
      listMap = buildListLabelToIdByFieldId_(categoryId);
      Logger.log(`📋 List map by field ID "${categoryId}": ${Object.keys(listMap || {}).length} values found`);
      if (listMap && Object.keys(listMap).length > 0) {
        Logger.log(`   Available values: ${Object.keys(listMap).filter(k => k === k.toUpperCase()).slice(0, 10).join(', ')}`);
      }
    }
    
    // PRIORITY 3: Try category-only lookup (for shared lists within a category)
    // Extract just the category part: "category_123.field_456" -> "category_123"
    if ((!listMap || Object.keys(listMap).length === 0) && categoryId) {
      const categoryOnly = categoryId.split('.')[0]; // Get first part before the dot
      if (categoryOnly && categoryOnly !== categoryId) {
        Logger.log(`📋 Trying category-only lookup: "${categoryOnly}"`);
        listMap = buildListLabelToIdByFieldId_(categoryOnly);
        Logger.log(`📋 List map by category "${categoryOnly}": ${Object.keys(listMap || {}).length} values found`);
        if (listMap && Object.keys(listMap).length > 0) {
          Logger.log(`   Available values: ${Object.keys(listMap).filter(k => k === k.toUpperCase()).slice(0, 10).join(', ')}`);
        }
      }
    }
    
    // Final check
    if (!listMap || Object.keys(listMap).length === 0) {
      Logger.log(`❌ CRITICAL: No list values found by any method!`);
      Logger.log(`   → Cell H1 (listName): "${listName}"`);
      Logger.log(`   → Cell I1 (categoryId): "${categoryId}"`);
      Logger.log(`   → This field is type "list" but has no listName and no matching field ID in Bob Lists`);
      Logger.log(`   → Suggestion: Run "Bob → SETUP → 2. Pull Lists" to refresh list values`);
    }
    
    const stats = state.stats || { completed: 0, skipped: 0, failed: 0 };
    
    for (let i = 0; i < data.length; i++) {
      const rowNum = state.nextRow + i;
      const ciq = normalizeBlank_(data[i][0]);
      const rawNew = normalizeBlank_(data[i][1]);
      
      if (!ciq) continue;
      
      ul.getRange(rowNum, 5).setValue(' Processing...');
      
      let bobId = ciqToBobMap[ciq];
      if (!bobId) bobId = lookupBobIdFromApi_(auth, ciq);
      
      if (!bobId) {
        writeUploaderResult_(ul, rowNum, 'FAILED', '', `CIQ ${ciq} not found`, '');
        stats.failed++;
        continue;
      }
      
      ul.getRange(rowNum, 3).setValue(bobId);
      ul.getRange(rowNum, 4).setValue(fieldPath);
      
      let newVal = rawNew;
      if (listMap && Object.keys(listMap).length > 0) {
        const hit = listMap[rawNew] || listMap[String(rawNew).toLowerCase()];
        if (hit) {
          newVal = hit;
          Logger.log(`✓ Mapped "${rawNew}" → "${hit}"`);
        } else {
          // List map exists but value not found - show helpful error
          const availableValues = Object.keys(listMap).filter(k => !k.toLowerCase().includes(k.toLowerCase())).slice(0, 15);
          Logger.log(`⚠️ WARNING: "${rawNew}" not found in list map.`);
          Logger.log(`   Available values: ${availableValues.join(', ')}`);
          Logger.log(`   Field: ${fieldPath}`);
          Logger.log(`   Category ID: ${categoryId}`);
          
          writeUploaderResult_(ul, rowNum, 'FAILED', 400, 
            `"${rawNew}" not valid. Available: ${availableValues.slice(0, 5).join(', ')}${availableValues.length > 5 ? '...' : ''}`, 
            ''
          );
          stats.failed++;
          continue;
        }
      } else {
        // No list map found - check if this is a list-type field
        const fieldType = normalizeBlank_(ul.getRange('G1').getValue());
        if (fieldType === 'list' || listName) {
          Logger.log(`⚠️ CRITICAL: No list values found for list-type field!`);
          Logger.log(`   Field: ${fieldPath}`);
          Logger.log(`   Category ID: ${categoryId}`);
          Logger.log(`   List Name: ${listName}`);
          Logger.log(`   Value to send: "${rawNew}"`);
          Logger.log(`   → Check "Bob Lists" sheet for this field's values`);
          Logger.log(`   → Or run: Bob → SETUP → 2. Pull Lists`);
          
          writeUploaderResult_(ul, rowNum, 'FAILED', 400, 
            `No list values found for field. Run "Pull Lists" or check Bob Lists sheet`, 
            ''
          );
          stats.failed++;
          continue;
        }
        // Not a list field, send value as-is
        Logger.log(`📝 Non-list field, sending "${rawNew}" as-is`);
      }
      
      const body = buildPutBody_(fieldPath, newVal);
      const putUrl = `${BASE}/v1/people/${encodeURIComponent(bobId)}`;
      
      try {
        const resp = UrlFetchApp.fetch(putUrl, {
          method: 'put',
          muteHttpExceptions: true,
          headers: { 
            Authorization: `Basic ${auth}`, 
            Accept: 'application/json', 
            'Content-Type': 'application/json' 
          },
          payload: JSON.stringify(body)
        });
        
        const code = resp.getResponseCode();
        
        if (code >= 200 && code < 300) {
          const verified = readBackField_(auth, bobId, fieldPath);
          writeUploaderResult_(ul, rowNum, 'COMPLETED', code, '', verified);
          stats.completed++;
        } else if (code === 304) {
          const verified = readBackField_(auth, bobId, fieldPath);
          writeUploaderResult_(ul, rowNum, 'SKIP', code, 'Already correct', verified);
          stats.skipped++;
        } else {
          writeUploaderResult_(ul, rowNum, 'FAILED', code, resp.getContentText().slice(0,200), '');
          stats.failed++;
        }
      } catch(e) {
        writeUploaderResult_(ul, rowNum, 'FAILED', 0, String(e).slice(0,200), '');
        stats.failed++;
      }
      
      Utilities.sleep(PUT_DELAY_MS);
    }
    
    SpreadsheetApp.flush();
  
    state.nextRow = endRow + 1;
    state.lastBatchTime = new Date().toISOString();
    state.stats = stats;
    
    props.setProperty('BATCH_UPLOAD_STATE', JSON.stringify(state));
  } finally {
    lock.releaseLock();
  }
}

function lookupBobIdFromApi_(auth, ciq) {
  try {
    const searchUrl = `${BASE}/v1/people/search`;
    const searchBody = { fields: ['internal.customId'], values: [ciq] };
    
    const resp = UrlFetchApp.fetch(searchUrl, {
      method: 'post',
      muteHttpExceptions: true,
      headers: { 
        Authorization: `Basic ${auth}`, 
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(searchBody)
    });
    
    if (resp.getResponseCode() === 200) {
      const result = JSON.parse(resp.getContentText());
      if (result.employees && result.employees.length > 0) {
        return result.employees[0].id;
      }
    }
  } catch(e) {
    Logger.log('API search failed for CIQ ' + ciq + ': ' + e);
  }
  return null;
}

function retryFailedRows() {
  const ul = getOrCreateSheet_(SHEET_UPLOADER);
  const { auth } = getCreds_();
  
  const fieldPath = normalizeBlank_(ul.getRange('E1').getValue());
  const listName = normalizeBlank_(ul.getRange('H1').getValue());
  
  if (!fieldPath) {
    throw new Error(' No field selected.');
  }
  
  const lastRow = ul.getLastRow();
  if (lastRow < 7) {
    throw new Error(' No data to retry.');
  }
  
  const data = ul.getRange(7, 1, lastRow - 6, 5).getValues();
  const ciqToBobMap = buildCiqToBobMap_();
  
  // Get category/field identifier from I1 (stored during field selection)
  const categoryId = normalizeBlank_(ul.getRange('I1').getValue());
  
  let listMap = null;
  
  // Debug: Show what we're working with
  Logger.log(`🔍 Field: ${fieldPath}`);
  Logger.log(`🔍 Category ID (I1): "${categoryId}"`);
  Logger.log(`🔍 List Name (H1): "${listName}"`);
  
  // PRIORITY 1: Try listName first (shared lists across multiple fields)
  if (listName) {
    listMap = buildListLabelToId_(listName);
    Logger.log(`📋 List map by name "${listName}": ${Object.keys(listMap || {}).length} values`);
    if (listMap && Object.keys(listMap).length > 0) {
      Logger.log(`   Available values: ${Object.keys(listMap).filter(k => k === k.toUpperCase()).slice(0, 10).join(', ')}`);
    }
  } else {
    Logger.log(`⚠️ No listName found in H1 - will try field ID lookup`);
  }
  
  // PRIORITY 2: Try field-specific lookup if listName didn't work
  if ((!listMap || Object.keys(listMap).length === 0) && categoryId) {
    listMap = buildListLabelToIdByFieldId_(categoryId);
    Logger.log(`📋 List map by field ID "${categoryId}": ${Object.keys(listMap || {}).length} values`);
    if (listMap && Object.keys(listMap).length > 0) {
      Logger.log(`   Available values: ${Object.keys(listMap).filter(k => k === k.toUpperCase()).slice(0, 10).join(', ')}`);
    }
  }
  
  // PRIORITY 3: Try category-only lookup (for shared lists within a category)
  if ((!listMap || Object.keys(listMap).length === 0) && categoryId) {
    const categoryOnly = categoryId.split('.')[0];
    if (categoryOnly && categoryOnly !== categoryId) {
      Logger.log(`📋 Trying category-only lookup: "${categoryOnly}"`);
      listMap = buildListLabelToIdByFieldId_(categoryOnly);
      Logger.log(`📋 List map by category "${categoryOnly}": ${Object.keys(listMap || {}).length} values`);
      if (listMap && Object.keys(listMap).length > 0) {
        Logger.log(`   Available values: ${Object.keys(listMap).filter(k => k === k.toUpperCase()).slice(0, 10).join(', ')}`);
      }
    }
  }
  
  // Final check
  if (!listMap || Object.keys(listMap).length === 0) {
    Logger.log(`❌ CRITICAL: No list values found by any method!`);
    Logger.log(`   → Cell H1 (listName): "${listName}"`);
    Logger.log(`   → Cell I1 (categoryId): "${categoryId}"`);
    Logger.log(`   → Suggestion: Run "Bob → SETUP → 2. Pull Lists"`);
  }
  
  let ok = 0, skip = 0, fail = 0;
  
  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 7;
    const status = normalizeBlank_(data[i][4]);
    
    if (status !== 'FAILED') continue;
    
    const ciq = normalizeBlank_(data[i][0]);
    const rawNew = normalizeBlank_(data[i][1]);
    
    if (!ciq) continue;
    
    ul.getRange(rowNum, 5).setValue(' Retrying...');
    SpreadsheetApp.flush();
    
    let bobId = ciqToBobMap[ciq];
    if (!bobId) {
      bobId = lookupBobIdFromApi_(auth, ciq);
    }
    
    if (!bobId) { 
      writeUploaderResult_(ul, rowNum, 'FAILED', '', `CIQ ${ciq} still not found`, ''); 
      fail++;
      continue; 
    }
    
    ul.getRange(rowNum, 3).setValue(bobId);
    ul.getRange(rowNum, 4).setValue(fieldPath);
    
    let newVal = rawNew;
    if (listMap) {
      const hit = listMap[rawNew] || listMap[String(rawNew).toLowerCase()];
      if (hit) newVal = hit;
    }
    
    const body = buildPutBody_(fieldPath, newVal);
    const putUrl = `${BASE}/v1/people/${encodeURIComponent(bobId)}`;
    let code = 0, text = '';
    
    try {
      const resp = UrlFetchApp.fetch(putUrl, {
        method: 'put',
        muteHttpExceptions: true,
        headers: { 
          Authorization: `Basic ${auth}`, 
          Accept: 'application/json', 
          'Content-Type': 'application/json' 
        },
        payload: JSON.stringify(body)
      });
      code = resp.getResponseCode();
      text = resp.getContentText();
    } catch(e) { 
      code = 0; 
      text = String(e && e.message || e); 
    }
    
    if (code >= 200 && code < 300) {
      const verified = readBackField_(auth, bobId, fieldPath);
      writeUploaderResult_(ul, rowNum, 'COMPLETED', code, '', verified);
      ok++;
    } else if (code === 304) {
      const verified = readBackField_(auth, bobId, fieldPath);
      writeUploaderResult_(ul, rowNum, 'SKIP', code, 'Already correct', verified);
      skip++;
    } else if (code === 404) {
      writeUploaderResult_(ul, rowNum, 'FAILED', code, 'Bob API 404', '');
      fail++;
    } else {
      writeUploaderResult_(ul, rowNum, 'FAILED', code || '', (text||'').slice(0,200), '');
      fail++;
    }
    
    SpreadsheetApp.flush();
    Utilities.sleep(PUT_DELAY_MS);
  }
  
  let msg = ` Retry Complete!\n\n Completed: ${ok}\n Skipped: ${skip}\n Failed: ${fail}`;
  
  SpreadsheetApp.getUi().alert('Retry Results', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function checkBatchStatus() {
  const props = PropertiesService.getScriptProperties();
  const stateJson = props.getProperty('BATCH_UPLOAD_STATE');
  
  if (!stateJson) {
    SpreadsheetApp.getUi().alert(
      ' No Batch Running',
      'No batch upload is currently running.\n\nStart one with " UPLOAD  Batch Upload"',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  
  const state = JSON.parse(stateJson);
  const ul = getOrCreateSheet_(SHEET_UPLOADER);
  const totalRows = ul.getLastRow() - 6;
  const completed = state.nextRow - 7;
  const progress = Math.round((completed / totalRows) * 100);
  const remaining = totalRows - completed;
  const estimatedMinutes = Math.ceil(remaining / BATCH_SIZE) * TRIGGER_INTERVAL;
  
  const stats = state.stats || { completed: 0, skipped: 0, failed: 0 };
  
  const startTime = new Date(state.startTime || state.lastBatchTime);
  const elapsed = Math.round((new Date() - startTime) / 60000);
  
  SpreadsheetApp.getUi().alert(
    ' Batch Upload Status',
    `Field: ${state.fieldName}\n\n` +
    `Progress: ${completed}/${totalRows} rows (${progress}%)\n` +
    `Remaining: ${remaining} rows\n\n` +
    `Results So Far:\n` +
    ` Completed: ${stats.completed}\n` +
    ` Skipped: ${stats.skipped}\n` +
    ` Failed: ${stats.failed}\n\n` +
    `Time Elapsed: ${elapsed} minutes\n` +
    `Est. Remaining: ~${estimatedMinutes} minutes\n\n` +
    `Last Batch: ${new Date(state.lastBatchTime).toLocaleString()}\n` +
    `Next Batch: In ~${TRIGGER_INTERVAL} minutes`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function createBatchTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'processBatch') {
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
    }
  });
  
  Logger.log(`🔄 Deleted ${deletedCount} old trigger(s), creating new one`);
  
  const newTrigger = ScriptApp.newTrigger('processBatch')
    .timeBased()
    .everyMinutes(TRIGGER_INTERVAL)
    .create();
  
  Logger.log(`✅ Trigger created: ${newTrigger.getUniqueId()}`);
  Logger.log(`⏰ Will fire every ${TRIGGER_INTERVAL} minute(s)`);
  
  // Immediately run the first batch (don't wait for trigger)
  try {
    Logger.log(`▶️ Starting first batch immediately...`);
    processBatch();
  } catch(e) {
    Logger.log(`⚠️ First batch failed: ${e}`);
    throw e;
  }
}

function clearBatchUpload() {
  const props = PropertiesService.getScriptProperties();
  const hadBatch = !!props.getProperty('BATCH_UPLOAD_STATE');
  
  props.deleteProperty('BATCH_UPLOAD_STATE');
  
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'processBatch') {
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
    }
  });
  
  // Release any stuck locks
  try {
    const lock = LockService.getScriptLock();
    lock.releaseLock();
  } catch(e) {
    // Lock wasn't held, that's fine
  }
  
  if (hadBatch) {
    toast_(`🛑 Batch upload stopped and cleared.\n\n${deletedCount} trigger(s) deleted.`);
  } else {
    toast_(`ℹ️ No batch upload was running.\n\n${deletedCount} trigger(s) deleted.`);
  }
}

function clearUploadDataAfterBatch_(stats) {
  const ul = getOrCreateSheet_(SHEET_UPLOADER);
  const lastRow = ul.getLastRow();
  
  if (lastRow <= 6) return;
  
  const dataRows = lastRow - 6;
  
  const response = SpreadsheetApp.getUi().alert(
    ' Batch Upload Complete!',
    `Final Results:\n\n` +
    ` Completed: ${stats.completed}\n` +
    ` Skipped: ${stats.skipped}\n` +
    ` Failed: ${stats.failed}\n\n` +
    `Clear ${dataRows} rows of upload data?\n` +
    `(Field selection will be kept for next upload)`,
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );
  
  if (response === SpreadsheetApp.getUi().Button.YES) {
    ul.getRange(7, 1, dataRows, ul.getMaxColumns()).clearContent().clearFormat();
    
    if (dataRows > 100) {
      ul.deleteRows(7, dataRows);
    }
    
    toast_(' Upload data cleared. Ready for next upload!');
  }
}

function clearAllUploadData() {
  const ss = SpreadsheetApp.getActive();
  const regularSheet = ss.getSheetByName(SHEET_UPLOADER);
  const historySheet = ss.getSheetByName(CONFIG.HISTORY_SHEET);
  
  let clearedSheets = [];
  let totalRowsCleared = 0;
  
  if (regularSheet && regularSheet.getLastRow() > 6) {
    const dataRows = regularSheet.getLastRow() - 6;
    const maxCols = regularSheet.getMaxColumns();
    
    regularSheet.getRange(7, 1, dataRows, maxCols)
      .clearContent()
      .clearFormat()
      .clearNote()
      .clearDataValidations();
    
    if (dataRows > 100) {
      regularSheet.deleteRows(7, dataRows);
    }
    
    clearedSheets.push('Field Uploader');
    totalRowsCleared += dataRows;
  }
  
  if (historySheet && historySheet.getLastRow() > 13) {
    const dataRows = historySheet.getLastRow() - 13;
    const maxCols = historySheet.getMaxColumns();
    
    historySheet.getRange(14, 1, dataRows, maxCols)
      .clearContent()
      .clearFormat()
      .clearNote()
      .clearDataValidations();
    
    if (dataRows > 100) {
      historySheet.deleteRows(14, dataRows);
    }
    
    clearedSheets.push('History Uploader');
    totalRowsCleared += dataRows;
  }
  
  if (clearedSheets.length === 0) {
    SpreadsheetApp.getUi().alert(
      ' Already Clean',
      'No upload data to clear.\n\nBoth uploader sheets are empty and ready to use.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } else {
    SpreadsheetApp.getUi().alert(
      ' Data Cleared',
      `Cleared ${totalRowsCleared} rows from:\n ${clearedSheets.join('\n ')}\n\n` +
      `Removed all notes, formatting, and validations.\n` +
      `Field/table selections preserved.\n` +
      `Ready for new uploads!`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

// ============================================================================
// HISTORY UPLOADER FUNCTIONS
// ============================================================================

function setupHistoryUploader() {
  const sh = getOrCreateSheet_('History Uploader');
  sh.clear();
  
  sh.getRange('A1').setValue('History Table Uploader')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground(CONFIG.COLORS.HEADER)
    .setFontColor(CONFIG.COLORS.HEADER_TEXT);
  
  sh.getRange('A2').setValue('Update salary, work history, or variable pay tables')
    .setFontStyle('italic')
    .setFontColor('#666666');
  
  sh.getRange('A3').setValue('Table Type (select one) *').setFontWeight('bold');
  
  formatRequiredInput_(sh.getRange('B4'), 'Select table type: Salary/Payroll, Work History, or Variable Pay');
  sh.getRange('B4').setValue('')
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['Salary / Payroll', 'Work History', 'Variable Pay', 'Equity / Grants'], true)
        .setAllowInvalid(false)
        .setHelpText('⚠️ REQUIRED: Select which history table to update')
        .build()
    );
  
  sh.getRange('A6').setValue('Instructions:').setFontWeight('bold')
    .setBackground(CONFIG.COLORS.SECTION_HEADER);
  sh.getRange('A7').setValue('1. Select table type in B4 above');
  sh.getRange('A8').setValue('2. Click "Generate Columns for Table"');
  sh.getRange('A9').setValue('3. Paste your data starting at row 14');
  sh.getRange('A10').setValue('4. Click "Validate History Upload Data"');
  sh.getRange('A11').setValue('5. Click "Quick" or "Batch" upload');
  
  sh.setColumnWidth(1, 300);
  sh.setColumnWidth(2, 250);
  
  toast_('✅ History Uploader sheet created.\n\nSelect table type in B4, then generate columns.');
}

function generateHistoryColumns() {
  const sh = getOrCreateSheet_('History Uploader');
  const tableType = String(sh.getRange('B4').getValue() || '').trim();
  
  if (!tableType) {
    SpreadsheetApp.getUi().alert(
      '⚠️ No Table Selected',
      'Select a table type in B4 first.\n\nChoices: Salary/Payroll, Work History, Variable Pay, or Equity/Grants',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  
  let columns = [];
  
  if (tableType === 'Salary / Payroll') {
    columns = [
      { name: 'CIQ ID', required: true, listName: null },
      { name: 'Effective Date *', required: true, listName: null },
      { name: 'Base Salary *', required: true, listName: null },
      { name: 'Currency *', required: true, listName: null, fixedValues: ['INR', 'USD', 'GBP'] },
      { name: 'Pay Period *', required: true, listName: null },
      { name: 'Pay Frequency', required: false, listName: null },
      { name: 'Change Type', required: false, listName: 'Change Type' },
      { name: 'Reason', required: false, listName: null }
    ];
  } else if (tableType === 'Work History') {
    columns = [
      { name: 'CIQ ID', required: true, listName: null },
      { name: 'Effective Date *', required: true, listName: null },
      { name: 'Job Title', required: false, listName: 'Job Title' },
      { name: 'Department', required: false, listName: 'Department' },
      { name: 'Department Code', required: false, listName: 'Department Code' },
      { name: 'Job Level', required: false, listName: 'Job Level' },
      { name: 'Site', required: false, listName: 'Site' },
      { name: 'Team', required: false, listName: null },
      { name: 'ELT', required: false, listName: null },
      { name: 'Reports To', required: false, listName: null },
      { name: 'Change Type', required: false, listName: 'Change Type' },
      { name: 'Reason', required: false, listName: null }
    ];
  } else if (tableType === 'Variable Pay') {
    columns = [
      { name: 'CIQ ID', required: true, listName: null },
      { name: 'Effective Date *', required: true, listName: null },
      { name: 'Variable Type', required: false, listName: 'Variable Type' },
      { name: 'Commission/Bonus %', required: false, listName: null },
      { name: 'Amount', required: false, listName: null },
      { name: 'Currency', required: false, listName: null, fixedValues: ['INR', 'USD', 'GBP'] },
      { name: 'Pay Period', required: false, listName: null, fixedValues: ['Monthly', 'Annual', 'Quarterly', 'Half-Yearly'] },
      { name: 'Pay Frequency', required: false, listName: null, fixedValues: ['Monthly', 'Annually', 'Quarterly'] },
      { name: 'Reason', required: false, listName: null }
    ];
  } else if (tableType === 'Equity / Grants') {
    columns = [
      { name: 'CIQ ID', required: true, listName: null },
      { name: 'Effective Date *', required: true, listName: null },
      { name: 'Grants', required: false, listName: null },
      { name: 'Grant Type', required: false, listName: 'grantTypes' },
      { name: 'Grant Status', required: false, listName: 'grantStatuses' }
    ];
  }
  
  sh.getRange('D2').setValue(columns.length);
  sh.getRange(12, 1, 989, 50).clearContent().clearFormat();
  
  formatSectionHeader_(sh.getRange(12, 1), 'Data Columns - Paste data starting at row 14');
  
  const headerRow = columns.map(c => c.name);
  const statusColumns = ['GET Status', 'POST Status', 'HTTP', 'Error', 'Entry ID'];
  const fullHeader = headerRow.concat(statusColumns);
  
  sh.getRange(13, 1, 1, fullHeader.length).setValues([fullHeader]);
  formatHeaderRow_(sh, 13, fullHeader.length);
  
  const listMap = buildListNameMap_();
  
  for (let colIndex = 0; colIndex < columns.length; colIndex++) {
    const colNum = colIndex + 1;
    const column = columns[colIndex];
    const range = sh.getRange(14, colNum, 1000, 1);
    
    if (column.fixedValues && column.fixedValues.length > 0) {
      // Use fixed values defined in column config (takes priority)
      range.setDataValidation(
        SpreadsheetApp.newDataValidation()
          .requireValueInList(column.fixedValues, true)
          .setHelpText(`🔽 Select ${column.name}`)
          .build()
      );
    } else if (column.listName && listMap[column.listName]) {
      const listValues = Object.values(listMap[column.listName]).map(v => v.label);
      
      if (listValues.length > 0) {
        range.setDataValidation(
          SpreadsheetApp.newDataValidation()
            .requireValueInList(listValues, true)
            .setHelpText(`🔽 Select from ${column.listName} list`)
            .build()
        );
      }
    } else if (column.name === 'Pay Period *' || column.name === 'Pay Period') {
      // Default pay period values for Salary/Payroll
      const payPeriodVals = ['Annual', 'Hourly', 'Daily', 'Weekly', 'Monthly'];
      range.setDataValidation(
        SpreadsheetApp.newDataValidation()
          .requireValueInList(payPeriodVals, true)
          .setHelpText('🔽 Select pay period')
          .build()
      );
    } else if (column.name === 'Pay Frequency') {
      // Pay frequency values matching Bob's UI exactly
      const payFreqVals = ['Weekly', 'Monthly', 'Pro rata', 'Every two weeks', 'Twice a month', 'Four weekly'];
      range.setDataValidation(
        SpreadsheetApp.newDataValidation()
          .requireValueInList(payFreqVals, true)
          .setHelpText('🔽 Select pay frequency')
          .build()
      );
    }
  }
  
  sh.setFrozenRows(13);
  autoFitAllColumns_(sh);
  
  toast_(`✅ Columns generated for "${tableType}"\n\nAll list fields have dropdowns.\nPaste data starting at row 14.`);
}

function validateHistoryUpload() {
  const sh = getOrCreateSheet_('History Uploader');
  const tableType = String(sh.getRange('B4').getValue() || '').trim();
  
  if (!tableType) {
    SpreadsheetApp.getUi().alert(
      '⚠️ No Table Selected',
      'Select a table type in B4 first.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  
  const lastRow = sh.getLastRow();
  if (lastRow <= 13) {
    SpreadsheetApp.getUi().alert(
      '⚠️ No Data',
      'No data to validate.\n\nPaste data starting at row 14.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  
  const dataRange = sh.getRange(14, 1, lastRow - 13, 10).getValues();
  const mapCIQtoBob = buildCiqToBobMap_();
  
  let valid = 0, invalid = 0, empty = 0;
  const issues = [];
  
  for (let i = 0; i < dataRange.length; i++) {
    const row = 14 + i;
    const ciq = String(dataRange[i][0] || '').trim();
    const effectiveDate = String(dataRange[i][1] || '').trim();
    const value2 = String(dataRange[i][2] || '').trim();
    
    if (!ciq && !effectiveDate && !value2) {
      empty++;
      continue;
    }
    
    if (!ciq) {
      invalid++;
      if (issues.length < 10) issues.push(`Row ${row}: Missing CIQ ID`);
      continue;
    }
    
    if (!effectiveDate) {
      invalid++;
      if (issues.length < 10) issues.push(`Row ${row}: Missing Effective Date`);
      continue;
    }
    
    if (!mapCIQtoBob[ciq]) {
      invalid++;
      if (issues.length < 10) issues.push(`Row ${row}: CIQ ${ciq} not found`);
      continue;
    }
    
    valid++;
  }
  
  const totalRows = dataRange.length - empty;
  const estimatedMinutes = Math.ceil(totalRows / BATCH_SIZE) * TRIGGER_INTERVAL;
  
  let msg = `📊 History Upload Validation\n\n`;
  msg += `Table: ${tableType}\n`;
  msg += `Total Rows: ${totalRows}\n\n`;
  msg += `✅ Valid: ${valid}\n`;
  
  if (empty > 0) msg += `⏭️ Empty: ${empty}\n`;
  if (invalid > 0) msg += `❌ Invalid: ${invalid}\n`;
  
  if (issues.length > 0) {
    msg += `\n⚠️ Issues (first 10):\n`;
    issues.forEach(issue => msg += `• ${issue}\n`);
    
    if (invalid > 10) msg += `...and ${invalid - 10} more issues\n`;
    
    msg += `\n💡 SOLUTION: Change B3 to "All" in Employees sheet,\n`;
    msg += `   then re-run "3. Pull Employees"\n`;
  }
  
  msg += `\n`;
  
  if (valid > 0) {
    msg += `✅ READY TO UPLOAD!\n\n`;
    msg += `📊 Estimated Time: ~${estimatedMinutes} minutes\n`;
    msg += totalRows <= 40 ? `💡 Recommendation: Use Quick Upload` : `💡 Recommendation: Use Batch Upload`;
  } else {
    msg += `⚠️ FIX ERRORS BEFORE UPLOADING`;
  }
  
  SpreadsheetApp.getUi().alert('Validation Report', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function runQuickHistoryUpload() {
  const sh = getOrCreateSheet_('History Uploader');
  const tableType = String(sh.getRange('B4').getValue() || '').trim();
  
  if (!tableType) {
    SpreadsheetApp.getUi().alert(
      '⚠️ No Table Selected',
      'Select a table type in B4 first.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  
  const lastRow = sh.getLastRow();
  const totalRows = lastRow - 13;
  
  if (totalRows <= 0) {
    SpreadsheetApp.getUi().alert(
      '⚠️ No Data',
      'No data to upload.\n\nPaste data starting at row 14.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  
  // Rate limit: 10 rows/min = ~6 seconds per row
  // Estimated time: totalRows * 6 seconds
  const estimatedSeconds = totalRows * 6;
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);
  
  // Confirm with user showing estimated time
    const response = SpreadsheetApp.getUi().alert(
    '▶️ Start Quick History Upload',
    `Table: ${tableType}\n` +
    `Rows: ${totalRows}\n\n` +
    `⚠️ Bob API Rate Limit: 10 requests/minute\n` +
    `Estimated Time: ~${estimatedMinutes} minute(s)\n\n` +
    `The upload will process with 6 second delays\n` +
    `to respect rate limits and avoid 429 errors.\n\n` +
    `Continue?`,
      SpreadsheetApp.getUi().ButtonSet.YES_NO
    );
  
    if (response !== SpreadsheetApp.getUi().Button.YES) return;
  
  toast_(`⏳ Processing ${totalRows} rows (~${estimatedMinutes} min). Please wait...`);
  
  processHistoryUpload_(tableType, 14, lastRow);
  
  SpreadsheetApp.getUi().alert(
    '✅ Quick Upload Complete',
    'Check the status columns for results.\n\n' +
    'GREEN = Completed\n' +
    'YELLOW = Skipped (already exists)\n' +
    'RED = Failed\n\n' +
    'Use "🧹 CLEANUP → Clear All Upload Data" when done.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Retry failed history upload rows (429 rate limit errors)
 */
function retryFailedHistoryRows() {
  const sh = getOrCreateSheet_('History Uploader');
  const tableType = String(sh.getRange('B4').getValue() || '').trim();
  
  if (!tableType) {
    SpreadsheetApp.getUi().alert('⚠️ No Table Selected', 'Select a table type in B4 first.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  const lastRow = sh.getLastRow();
  if (lastRow < 14) {
    SpreadsheetApp.getUi().alert('⚠️ No Data', 'No data to retry.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  const columnCount = parseInt(sh.getRange('D2').getValue() || '8');
  const statusCol = columnCount + 2; // POST Status column
  
  // Find failed rows
  const failedRows = [];
  for (let row = 14; row <= lastRow; row++) {
    const status = sh.getRange(row, statusCol).getValue();
    if (status === 'FAILED') {
      failedRows.push(row);
    }
  }
  
  if (failedRows.length === 0) {
    SpreadsheetApp.getUi().alert('✅ No Failed Rows', 'All rows have already been processed successfully.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  const estimatedMinutes = Math.ceil(failedRows.length * 6 / 60);
  
  const response = SpreadsheetApp.getUi().alert(
    '🔄 Retry Failed Rows',
    `Found ${failedRows.length} failed rows.\n\n` +
    `Estimated Time: ~${estimatedMinutes} minute(s)\n\n` +
    `Retry these rows?`,
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );
  
  if (response !== SpreadsheetApp.getUi().Button.YES) return;
  
  toast_(`⏳ Retrying ${failedRows.length} failed rows...`);
  
  const { auth } = getCreds_();
  const mapCIQtoBob = buildCiqToBobMap_();
  const statusColStart = columnCount + 1;
  const RATE_LIMIT_DELAY_MS = 6000;
  
  let ok = 0, fail = 0;
  
  for (let i = 0; i < failedRows.length; i++) {
    const row = failedRows[i];
    
    // Read row data
    const rowData = sh.getRange(row, 1, 1, columnCount).getValues()[0];
    const ciq = String(rowData[0] || '').trim();
    const effectiveDate = formatIsoDate_(rowData[1]);
    
    if (!ciq) continue;
    
    const bobId = mapCIQtoBob[ciq];
    if (!bobId) {
      sh.getRange(row, statusColStart + 3).setValue('CIQ not found');
      fail++;
      continue;
    }
    
    // Rate limit delay
    if (i > 0) {
      Utilities.sleep(RATE_LIMIT_DELAY_MS);
    }
    
    const payload = buildHistoryPayload_(tableType, rowData, effectiveDate);
    const endpoint = getHistoryEndpoint_(tableType, bobId);
    
    try {
      const postResp = UrlFetchApp.fetch(endpoint, {
        method: 'post',
        muteHttpExceptions: true,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify(payload)
      });
      
      const httpCode = postResp.getResponseCode();
      
      if (httpCode >= 200 && httpCode < 300) {
        sh.getRange(row, statusColStart + 1).setValue('COMPLETED').setBackground(CONFIG.COLORS.SUCCESS);
        sh.getRange(row, statusColStart + 2).setValue(httpCode);
        sh.getRange(row, statusColStart + 3).setValue('');
        ok++;
      } else if (httpCode === 429) {
        // Still rate limited, wait longer and retry once
        Utilities.sleep(15000);
        const retryResp = UrlFetchApp.fetch(endpoint, {
          method: 'post',
          muteHttpExceptions: true,
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(payload)
        });
        
        const retryCode = retryResp.getResponseCode();
        if (retryCode >= 200 && retryCode < 300) {
          sh.getRange(row, statusColStart + 1).setValue('COMPLETED').setBackground(CONFIG.COLORS.SUCCESS);
          sh.getRange(row, statusColStart + 2).setValue(retryCode);
          sh.getRange(row, statusColStart + 3).setValue('');
          ok++;
        } else {
          sh.getRange(row, statusColStart + 2).setValue(retryCode);
          sh.getRange(row, statusColStart + 3).setValue(retryResp.getContentText().slice(0, 200));
          fail++;
        }
      } else {
        sh.getRange(row, statusColStart + 2).setValue(httpCode);
        sh.getRange(row, statusColStart + 3).setValue(postResp.getContentText().slice(0, 200));
        fail++;
      }
    } catch(e) {
      sh.getRange(row, statusColStart + 3).setValue(String(e).slice(0, 200));
      fail++;
    }
    
    SpreadsheetApp.flush();
  }
  
  SpreadsheetApp.getUi().alert(
    '✅ Retry Complete',
    `Retried ${failedRows.length} rows:\n\n` +
    `✅ Completed: ${ok}\n` +
    `❌ Still Failed: ${fail}`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function runBatchHistoryUpload() {
  const sh = getOrCreateSheet_('History Uploader');
  const tableType = String(sh.getRange('B4').getValue() || '').trim();
  
  if (!tableType) {
    SpreadsheetApp.getUi().alert(
      '⚠️ No Table Selected',
      'Select a table type in B4 first.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  
  const lastRow = sh.getLastRow();
  const totalRows = lastRow - 13;
  
  if (totalRows <= 0) {
    SpreadsheetApp.getUi().alert(
      '⚠️ No Data',
      'No data to upload.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  
  const estimatedMinutes = Math.ceil(totalRows / BATCH_SIZE) * TRIGGER_INTERVAL;
  
  const response = SpreadsheetApp.getUi().alert(
    '▶️ Start Batch History Upload',
    `Table: ${tableType}\nRows: ${totalRows}\n\n` +
    `Processing: ${BATCH_SIZE} rows every ${TRIGGER_INTERVAL} minutes\n` +
    `Estimated Time: ~${estimatedMinutes} minutes\n\n` +
    `You can close this tab - upload will continue.\n\n` +
    `Start batch upload?`,
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );
  
  if (response !== SpreadsheetApp.getUi().Button.YES) return;
  
  const props = PropertiesService.getScriptProperties();
  props.setProperty('BATCH_HISTORY_UPLOAD_STATE', JSON.stringify({
    nextRow: 14,
    tableType: tableType,
    lastRow: lastRow,
    stats: { completed: 0, skipped: 0, failed: 0 },
    lastBatchTime: new Date().toISOString(),
    startTime: new Date().toISOString()
  }));
  
  createBatchHistoryTrigger_();
  toast_('✅ Batch upload started!\n\nCheck progress: 📊 MONITORING → Check Batch Status');
}

function processBatchHistory_() {
  // Acquire lock to prevent multiple batches from running simultaneously
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(1000)) {
      Logger.log('⚠️ Previous history batch still running, skipping this trigger');
      return; // Skip if another batch is already running
    }
  } catch(e) {
    Logger.log(`⚠️ Could not acquire lock: ${e}`);
    return;
  }
  
  try {
    const props = PropertiesService.getScriptProperties();
    const stateJson = props.getProperty('BATCH_HISTORY_UPLOAD_STATE');
    
    if (!stateJson) {
      lock.releaseLock();
      return;
    }
  
    const state = JSON.parse(stateJson);
    const sh = getOrCreateSheet_('History Uploader');
    const lastRow = sh.getLastRow();
    
    if (state.nextRow > lastRow) {
      clearBatchHistoryUpload();
      
      SpreadsheetApp.getUi().alert(
        '✅ Batch History Upload Complete',
        `Final Results:\n\n` +
        `✅ Completed: ${state.stats.completed}\n` +
        `⏭️ Skipped: ${state.stats.skipped}\n` +
        `❌ Failed: ${state.stats.failed}\n\n` +
        `Use "🧹 CLEANUP → Clear All Upload Data" to clean up.`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      lock.releaseLock();
      return;
    }
    
    const endRow = Math.min(state.nextRow + BATCH_SIZE - 1, lastRow);
    processHistoryUpload_(state.tableType, state.nextRow, endRow, state);
    
    state.nextRow = endRow + 1;
    state.lastBatchTime = new Date().toISOString();
    props.setProperty('BATCH_HISTORY_UPLOAD_STATE', JSON.stringify(state));
  } finally {
    lock.releaseLock();
  }
}

function processHistoryUpload_(tableType, startRow, endRow, batchState) {
  const sh = getOrCreateSheet_('History Uploader');
  const { auth } = getCreds_();
  const mapCIQtoBob = buildCiqToBobMap_();
  
  // Get column count from metadata
  const columnCount = parseInt(sh.getRange('D2').getValue() || '8');
  const statusColStart = columnCount + 1;
  
  Logger.log(`📊 History Upload Config:`);
  Logger.log(`   Table Type: ${tableType}`);
  Logger.log(`   Column Count (D2): ${columnCount}`);
  Logger.log(`   Status Col Start: ${statusColStart}`);
  Logger.log(`   Reading rows ${startRow} to ${endRow}`);
  
  // Read only data columns
  const dataRange = sh.getRange(startRow, 1, endRow - startRow + 1, columnCount).getValues();
  Logger.log(`   Data range: ${dataRange.length} rows x ${dataRange[0]?.length || 0} columns`);
  
  // Rate limiting: 10 POST requests per minute = 6 seconds between each
  const RATE_LIMIT_DELAY_MS = 6000;
  
  let ok = 0, skip = 0, fail = 0;
  let postCount = 0; // Track POST requests for rate limiting
  
  for (let i = 0; i < dataRange.length; i++) {
    const row = startRow + i;
    const ciq = String(dataRange[i][0] || '').trim();
    const effectiveDate = formatIsoDate_(dataRange[i][1]);
    
    if (!ciq) continue;
    
    const bobId = mapCIQtoBob[ciq];
    if (!bobId) {
      sh.getRange(row, statusColStart).setValue('FAILED').setBackground(CONFIG.COLORS.ERROR);
      sh.getRange(row, statusColStart + 1).setValue('N/A');
      sh.getRange(row, statusColStart + 2).setValue('');
      sh.getRange(row, statusColStart + 3).setValue('CIQ not found - Use "All" status in Employees');
      fail++;
      continue;
    }
    
    // Debug: Log raw row data BEFORE building payload
    Logger.log(`🔍 Row ${row} raw data (${dataRange[i].length} columns):`);
    for (let c = 0; c < dataRange[i].length; c++) {
      Logger.log(`   [${c}] = "${dataRange[i][c]}" (${typeof dataRange[i][c]})`);
    }
    
    // Build payload based on table type
    const payload = buildHistoryPayload_(tableType, dataRange[i], effectiveDate);
    
    // GET existing history to check for duplicates
    const endpoint = getHistoryEndpoint_(tableType, bobId);
    let isDuplicate = false;
    let getStatus = 'OK';
    
    try {
      const getResp = UrlFetchApp.fetch(endpoint, {
        method: 'get',
        muteHttpExceptions: true,
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
      });
      
      const getCode = getResp.getResponseCode();
      
      if (getCode === 200) {
        const existing = JSON.parse(getResp.getContentText());
        Logger.log(`📥 RAW Bob GET response (first 2000 chars):`);
        Logger.log(getResp.getContentText().slice(0, 2000));
        
        const historyArray = Array.isArray(existing) ? existing : existing.values || existing.salaries || existing.workHistory || existing.equities || [];
        Logger.log(`📥 Found ${historyArray.length} existing entries for this employee`);
        isDuplicate = historyArray.some(item => item.effectiveDate === effectiveDate);
        
        // DEBUG: Log existing entries to find Reason field name
        if (historyArray.length > 0) {
          Logger.log(`📥 Existing salary entries from Bob (looking for Reason field):`);
          // Find entry with a reason value (not empty)
          for (let e = 0; e < Math.min(historyArray.length, 5); e++) {
            const entry = historyArray[e];
            Logger.log(`\n   Entry ${e + 1}:`);
            // Log ALL fields to find which one contains reason values
            for (const [key, value] of Object.entries(entry)) {
              const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
              // Highlight fields that might be reason-related
              const reasonValues = ['merit', 'promotion', 'increase', 'transfer', 'adjustment'];
              const isReasonField = reasonValues.some(rv => valStr.toLowerCase().includes(rv));
              if (isReasonField) {
                Logger.log(`   ⭐ ${key}: ${valStr} ← POSSIBLE REASON FIELD`);
      } else {
                Logger.log(`      ${key}: ${valStr}`);
              }
            }
          }
        } else {
          Logger.log(`⚠️ No existing salary entries found for this employee`);
        }
      } else if (getCode === 429) {
        // Rate limited on GET, wait and retry
        Logger.log(`⚠️ Rate limited on GET for row ${row}, waiting...`);
        Utilities.sleep(10000); // Wait 10 seconds
        getStatus = 'Retry needed';
      } else {
        Logger.log(`⚠️ GET returned HTTP ${getCode}: ${getResp.getContentText().slice(0, 500)}`);
        getStatus = `HTTP ${getCode}`;
      }
    } catch(e) {
      getStatus = `Error: ${String(e).slice(0, 100)}`;
    }
    
    // Write GET status
    sh.getRange(row, statusColStart).setValue(getStatus);
    
    if (isDuplicate) {
      sh.getRange(row, statusColStart + 1).setValue('SKIP').setBackground(CONFIG.COLORS.WARNING);
      sh.getRange(row, statusColStart + 2).setValue('409');
      sh.getRange(row, statusColStart + 3).setValue('Entry already exists for this date');
      skip++;
      continue;
    }
    
    // Rate limit: Wait before POST if we've already made POSTs
    if (postCount > 0) {
      Logger.log(`⏱️ Rate limiting: waiting ${RATE_LIMIT_DELAY_MS}ms before POST #${postCount + 1}`);
      Utilities.sleep(RATE_LIMIT_DELAY_MS);
    }
    
    // POST/PUT new entry with retry logic for 429
    // Variable Pay uses PUT with nested structure, others use POST
    let postStatus = 'FAILED';
    let httpCode = '';
    let errorMsg = '';
    let entryId = '';
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    let finalPayload = payload;
    let httpMethod = 'post';
    
    if (tableType === 'Variable Pay') {
      Logger.log(`   📦 Variable Pay POST to /variable: ${JSON.stringify(finalPayload)}`);
    }
    
    while (retryCount <= MAX_RETRIES) {
    try {
      const postResp = UrlFetchApp.fetch(endpoint, {
          method: httpMethod,
        muteHttpExceptions: true,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
          payload: JSON.stringify(finalPayload)
      });
      
      httpCode = postResp.getResponseCode();
      
      if (httpCode >= 200 && httpCode < 300) {
        postStatus = 'COMPLETED';
        ok++;
          postCount++;
          break;
        } else if (httpCode === 429) {
          // Rate limited - exponential backoff
          retryCount++;
          if (retryCount <= MAX_RETRIES) {
            const backoffMs = Math.pow(2, retryCount) * 5000; // 10s, 20s, 40s
            Logger.log(`⚠️ 429 Rate limit on row ${row}, retry ${retryCount}/${MAX_RETRIES} in ${backoffMs}ms`);
            Utilities.sleep(backoffMs);
          } else {
            postStatus = 'FAILED';
            errorMsg = 'Rate limit exceeded after retries';
            fail++;
          }
      } else {
        postStatus = 'FAILED';
        errorMsg = postResp.getContentText().slice(0, 200);
        fail++;
          postCount++;
          break;
      }
    } catch(e) {
      postStatus = 'FAILED';
      errorMsg = String(e).slice(0, 200);
      fail++;
        break;
      }
    }
    
    // Write POST status and results
    const statusCell = sh.getRange(row, statusColStart + 1);
    statusCell.setValue(postStatus);
    
    if (postStatus === 'COMPLETED') {
      statusCell.setBackground(CONFIG.COLORS.SUCCESS);
    } else if (postStatus === 'FAILED') {
      statusCell.setBackground(CONFIG.COLORS.ERROR);
    }
    
    sh.getRange(row, statusColStart + 2).setValue(httpCode);
    sh.getRange(row, statusColStart + 3).setValue(errorMsg);
    sh.getRange(row, statusColStart + 4).setValue(entryId);
    
    SpreadsheetApp.flush();
  }
  
  if (batchState) {
    batchState.stats.completed += ok;
    batchState.stats.skipped += skip;
    batchState.stats.failed += fail;
  }
  
  Logger.log(`📊 History upload complete: ${ok} completed, ${skip} skipped, ${fail} failed`);
}

/**
 * Format a date value as ISO date string (YYYY-MM-DD)
 * @param {Date|string|number} dateValue - Date from spreadsheet
 * @returns {string} ISO formatted date (YYYY-MM-DD)
 */
function formatIsoDate_(dateValue) {
  if (!dateValue) return '';
  
  // If already a string in YYYY-MM-DD format, return as-is
  if (typeof dateValue === 'string') {
    const trimmed = dateValue.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // Try to parse other date string formats
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      // Use spreadsheet timezone to avoid shifts
      const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
      return Utilities.formatDate(parsed, tz, 'yyyy-MM-dd');
    }
    Logger.log(`⚠️ Could not parse date string: ${trimmed}`);
    return '';
  }
  
  // Handle Date objects - use Utilities.formatDate to avoid timezone issues
  if (dateValue instanceof Date) {
    if (isNaN(dateValue.getTime())) {
      Logger.log(`⚠️ Invalid Date object`);
      return '';
    }
    // Use spreadsheet timezone to preserve the date as shown
    const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(dateValue, tz, 'yyyy-MM-dd');
  }
  
  // Handle numbers (Excel/Sheets serial dates)
  if (typeof dateValue === 'number') {
    // Convert serial date to Date object (Sheets epoch: Dec 30, 1899)
    const date = new Date((dateValue - 25569) * 86400 * 1000);
    const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
  }
  
  Logger.log(`⚠️ Unknown date type: ${typeof dateValue} = ${dateValue}`);
  return '';
}

function buildHistoryPayload_(tableType, rowData, effectiveDate) {
  const payload = { effectiveDate };
  
  // Debug: Log row data to see what we're working with
  Logger.log(`📋 Building payload for ${tableType}:`);
  Logger.log(`   Row data length: ${rowData.length}`);
  Logger.log(`   effectiveDate: ${effectiveDate}`);
  
  // Build list lookup for reason/change type fields (salary is default for backward compat)
  const { labelMap: reasonLabelMap, columnPath: reasonColumnPath } = buildHistoryReasonListMap_('salary');
  
  if (tableType === 'Salary / Payroll') {
    // Column mapping for Salary/Payroll:
    // 0: CIQ ID, 1: Effective Date, 2: Base Salary, 3: Currency
    // 4: Pay Period, 5: Pay Frequency, 6: Change Type, 7: Reason
    payload.base = {
      value: parseFloat(rowData[2]) || 0,
      currency: String(rowData[3] || '')
    };
    payload.payPeriod = String(rowData[4] || '');
    if (rowData[5]) payload.payFrequency = String(rowData[5]);
    
    // Reason field: Must be nested inside "customColumns" object!
    // Bob returns: { "customColumns": { "column_1764918506367": "265675703" } }
    const reasonLabel = String(rowData[7] || rowData[6] || '').trim();
    if (reasonLabel) {
      const reasonId = reasonLabelMap[reasonLabel] || reasonLabelMap[reasonLabel.toLowerCase()];
      Logger.log(`   🔍 Reason mapping: "${reasonLabel}" → ID: ${reasonId || 'not found'}`);
      Logger.log(`   🔍 Column path: ${reasonColumnPath || 'not found'}`);
      
      if (reasonColumnPath && reasonId) {
        // Extract just the column key (e.g., "column_1764918506367")
        const colKey = reasonColumnPath.split('.').pop();
        
        // NEST inside customColumns object - this is how Bob expects it!
        payload.customColumns = {
          [colKey]: reasonId
        };
        Logger.log(`   ✅ customColumns.${colKey}: ${reasonId}`);
      } else if (reasonId) {
        // Fallback if no column path
        payload.customColumns = { reason: reasonId };
        Logger.log(`   ✅ customColumns.reason: ${reasonId}`);
      } else {
        Logger.log(`   ⚠️ No ID found for "${reasonLabel}"`);
      }
    }
    
    // Log what's in each column
    Logger.log(`   Col 2 (Base): ${rowData[2]}`);
    Logger.log(`   Col 3 (Currency): ${rowData[3]}`);
    Logger.log(`   Col 4 (Pay Period): ${rowData[4]}`);
    Logger.log(`   Col 5 (Pay Frequency): ${rowData[5]}`);
    Logger.log(`   Col 6 (Change Type): ${rowData[6]}`);
    Logger.log(`   Col 7 (Reason): ${rowData[7]}`);
    
  } else if (tableType === 'Work History') {
    // Column mapping for Work History (based on Bob OpenAPI spec):
    // 0: CIQ ID, 1: Effective Date, 2: Job Title, 3: Department, 4: Department Code
    // 5: Job Level, 6: Site, 7: Team, 8: ELT, 9: Reports To, 10: Change Type, 11: Reason
    
    Logger.log(`   Col 2 (Job Title): ${rowData[2]}`);
    Logger.log(`   Col 3 (Department): ${rowData[3]}`);
    Logger.log(`   Col 4 (Department Code): ${rowData[4]}`);
    Logger.log(`   Col 5 (Job Level): ${rowData[5]}`);
    Logger.log(`   Col 6 (Site): ${rowData[6]}`);
    Logger.log(`   Col 7 (Team): ${rowData[7]}`);
    Logger.log(`   Col 8 (ELT): ${rowData[8]}`);
    Logger.log(`   Col 9 (Reports To): ${rowData[9]}`);
    Logger.log(`   Col 10 (Change Type): ${rowData[10]}`);
    Logger.log(`   Col 11 (Reason): ${rowData[11]}`);
    
    // Build list maps for fields that need ID lookup
    // List names in Bob Lists: title, department, site, etc. (lowercase)
    const jobTitleMap = buildListLabelToIdMap_('title');
    const departmentMap = buildListLabelToIdMap_('department');
    const siteMap = buildListLabelToIdMap_('site');
    const changeTypeMap = buildListLabelToIdMap_('workChangeType');
    
    // Job Title - needs ID from list, create if not exists
    const jobTitleLabel = String(rowData[2] || '').trim();
    if (jobTitleLabel) {
      // First try existing lookup
      let jobTitleId = jobTitleMap[jobTitleLabel] || jobTitleMap[jobTitleLabel.toLowerCase()];
      
      if (!jobTitleId) {
        // Title not found - try to create it in Bob
        jobTitleId = getOrCreateTitleId_(jobTitleLabel);
      }
      
      if (jobTitleId) {
        payload.title = jobTitleId;
        Logger.log(`   ✅ Job Title: "${jobTitleLabel}" → ${jobTitleId}`);
      } else {
        // Last resort - send label (will likely fail but shows in error)
        payload.title = jobTitleLabel;
        Logger.log(`   ⚠️ Job Title: "${jobTitleLabel}" - could not get or create ID`);
      }
    }
    
    // Department - needs ID from list
    const deptLabel = String(rowData[3] || '').trim();
    if (deptLabel) {
      const deptId = departmentMap[deptLabel] || departmentMap[deptLabel.toLowerCase()];
      payload.department = deptId || deptLabel;
      Logger.log(`   🔍 Department: "${deptLabel}" → ${deptId || 'using label'}`);
    }
    
    // Initialize customColumns for work custom fields
    payload.customColumns = {};
    
    // Department Code (Col 4) - dynamic lookup from Bob Lists
    const deptCode = String(rowData[4] || '').trim();
    if (deptCode) {
      const deptCodeMatch = findWorkCustomColumn_(deptCode);
      if (deptCodeMatch) {
        payload.customColumns[deptCodeMatch.columnKey] = deptCodeMatch.valueId;
        Logger.log(`   ✅ Dept Code: "${deptCode}" → ${deptCodeMatch.columnKey}: ${deptCodeMatch.valueId}`);
      } else {
        Logger.log(`   ⚠️ Dept Code: "${deptCode}" not found in Bob Lists`);
      }
    }
    
    // Job Level (Col 5) - dynamic lookup from Bob Lists
    const jobLevel = String(rowData[5] || '').trim();
    if (jobLevel) {
      const jobLevelMatch = findWorkCustomColumn_(jobLevel);
      if (jobLevelMatch) {
        payload.customColumns[jobLevelMatch.columnKey] = jobLevelMatch.valueId;
        Logger.log(`   ✅ Job Level: "${jobLevel}" → ${jobLevelMatch.columnKey}: ${jobLevelMatch.valueId}`);
      } else {
        Logger.log(`   ⚠️ Job Level: "${jobLevel}" not found in Bob Lists`);
      }
    }
    
    // Site - mandatory field
    // API expects: site (name string) OR siteId (numeric ID)
    const siteLabel = String(rowData[6] || '').trim();
    if (siteLabel) {
      const siteId = siteMap[siteLabel] || siteMap[siteLabel.toLowerCase()];
      if (siteId) {
        // Use siteId (numeric) when we have the ID
        payload.siteId = parseInt(siteId);
        Logger.log(`   🔍 Site: "${siteLabel}" → siteId: ${siteId}`);
      } else {
        // Fallback to site name
        payload.site = siteLabel;
        Logger.log(`   🔍 Site: "${siteLabel}" (using name)`);
      }
    }
    
    // Team (Col 7) - TEXT field stored in customColumns
    // From existing Bob data: column_1699014211468 stores Team values like "DSA"
    const team = String(rowData[7] || '').trim();
    if (team) {
      // Known column from existing Bob entries
      const teamColumnKey = 'column_1699014211468';
      payload.customColumns[teamColumnKey] = team;
      Logger.log(`   ✅ Team (text): "${team}" → ${teamColumnKey}: "${team}"`);
    }
    
    // ELT (Col 8) - LIST field, stores employee name ID
    // From existing Bob data: column_1746017863603 stores ELT values
    const elt = String(rowData[8] || '').trim();
    if (elt) {
      // First try to find the value ID by looking up the ELT name in Bob Lists
      const eltMatch = findWorkCustomColumn_(elt);
      // Known column from existing Bob entries
      const eltColumnKey = 'column_1746017863603';
      
      if (eltMatch) {
        // Use the found value ID with the known column key
        payload.customColumns[eltColumnKey] = eltMatch.valueId;
        Logger.log(`   ✅ ELT: "${elt}" → ${eltColumnKey}: ${eltMatch.valueId}`);
      } else {
        // Try to find ELT value ID from any work.* list
        const eltId = findEltValueId_(elt);
        if (eltId) {
          payload.customColumns[eltColumnKey] = eltId;
          Logger.log(`   ✅ ELT: "${elt}" → ${eltColumnKey}: ${eltId}`);
        } else {
          Logger.log(`   ⚠️ ELT: "${elt}" - value ID not found in Bob Lists`);
        }
      }
    }
    
    // Reports To - needs Bob internal ID from CIQ ID
    const reportsToInput = String(rowData[9] || '').trim();
    if (reportsToInput) {
      // Build CIQ to Bob ID map to look up manager's Bob ID
      const ciqToBobMap = buildCiqToBobMap_();
      const managerBobId = ciqToBobMap[reportsToInput];
      if (managerBobId) {
        payload.reportsTo = { id: managerBobId };
        Logger.log(`   ✅ reportsTo: CIQ ${reportsToInput} → Bob ID ${managerBobId}`);
      } else {
        // If not found in map, assume it's already a Bob ID
        payload.reportsTo = { id: reportsToInput };
        Logger.log(`   → reportsTo.id: ${reportsToInput} (assumed Bob ID)`);
      }
    }
    
    // Change Type (Col 10) - field is 'workChangeType' (not 'changeReason')
    // Values come from workChangeType list
    const changeTypeLabel = String(rowData[10] || '').trim();
    if (changeTypeLabel) {
      const changeTypeId = findWorkChangeTypeId_(changeTypeLabel);
      if (changeTypeId) {
        payload.workChangeType = changeTypeId;
        Logger.log(`   ✅ workChangeType: "${changeTypeLabel}" → ID: ${changeTypeId}`);
      } else {
        // Fallback to label if not found
        payload.workChangeType = changeTypeLabel;
        Logger.log(`   ⚠️ workChangeType: "${changeTypeLabel}" (ID not found, using label)`);
      }
    }
    
    // Reason text (Col 11)
    if (rowData[11]) {
      payload.reason = String(rowData[11]);
      Logger.log(`   → reason: ${rowData[11]}`);
    }
    
    // Remove empty customColumns
    if (Object.keys(payload.customColumns).length === 0) {
      delete payload.customColumns;
    } else {
      Logger.log(`   📦 customColumns: ${JSON.stringify(payload.customColumns)}`);
    }
    
    // Log final Work History payload for debugging
    Logger.log(`   📤 FINAL Work History payload: ${JSON.stringify(payload)}`);
    
  } else if (tableType === 'Variable Pay') {
    // Column mapping for Variable Pay:
    // 0: CIQ ID, 1: Effective Date, 2: Variable Type, 3: Commission/Bonus %
    // 4: Amount, 5: Currency, 6: Pay Period, 7: Pay Frequency, 8: Reason
    
    // Based on Bob's actual structure from manual upload:
    // - amount: { value: number, currency: string }
    // - customColumns: { column_1702655731330: %, column_1764922472006: reasonId, column_1725449166803: freqId }
    
    if (rowData[2]) payload.variableType = String(rowData[2]);
    if (rowData[6]) payload.paymentPeriod = String(rowData[6]);
    
    // Amount is nested with currency
    if (rowData[4] || rowData[5]) {
      payload.amount = {
        value: parseFloat(rowData[4]) || 0,
        currency: String(rowData[5] || 'INR')
      };
    }
    
    Logger.log(`   Col 2 (Variable Type): ${rowData[2]}`);
    Logger.log(`   Col 3 (Commission/Bonus %): ${rowData[3]}`);
    Logger.log(`   Col 4 (Amount): ${rowData[4]}`);
    Logger.log(`   Col 5 (Currency): ${rowData[5]}`);
    Logger.log(`   Col 6 (Pay Period): ${rowData[6]}`);
    Logger.log(`   Col 7 (Pay Frequency): ${rowData[7]}`);
    Logger.log(`   Col 8 (Reason): ${rowData[8]}`);
    
    // Build custom columns for Variable Pay
    const customCols = {};
    
    // Commission/Bonus % → column_1702655731330
    if (rowData[3]) {
      customCols['column_1702655731330'] = parseFloat(rowData[3]) || 0;
      Logger.log(`   ✅ customColumns.column_1702655731330 (Commission %): ${rowData[3]}`);
    }
    
    // Pay Frequency → column_1725449166803
    const payFreqLabel = String(rowData[7] || '').trim();
    if (payFreqLabel) {
      const payFreqMap = buildListLabelToIdMap_('payroll.variable.column_1725449166803');
      const payFreqId = payFreqMap[payFreqLabel] || payFreqMap[payFreqLabel.toLowerCase()];
      if (payFreqId) {
        customCols['column_1725449166803'] = payFreqId;
        Logger.log(`   ✅ customColumns.column_1725449166803 (Pay Frequency): ${payFreqId}`);
      }
    }
    
    // Reason → column_1764922472006
    const reasonLabel = String(rowData[8] || '').trim();
    if (reasonLabel) {
      const reasonMap = buildListLabelToIdMap_('payroll.variable.column_1764922472006');
      const reasonId = reasonMap[reasonLabel] || reasonMap[reasonLabel.toLowerCase()];
      if (reasonId) {
        customCols['column_1764922472006'] = reasonId;
        Logger.log(`   ✅ customColumns.column_1764922472006 (Reason): ${reasonId}`);
      }
    }
    
    // Add customColumns to payload
    if (Object.keys(customCols).length > 0) {
      payload.customColumns = customCols;
    }
    
  } else if (tableType === 'Equity / Grants') {
    // Column mapping for Equity / Grants:
    // 0: CIQ ID, 1: Effective Date, 2: Grants (amount), 3: Grant Type, 4: Grant Status
    
    // Build list maps for grant types and statuses
    const grantTypeMap = buildListLabelToIdMap_('grantTypes');
    const grantStatusMap = buildListLabelToIdMap_('grantStatuses');
    
    if (rowData[2]) payload.quantity = parseFloat(rowData[2]) || 0;
    
    const grantTypeLabel = String(rowData[3] || '').trim();
    if (grantTypeLabel) {
      const grantTypeId = grantTypeMap[grantTypeLabel] || grantTypeMap[grantTypeLabel.toLowerCase()];
      payload.grantType = grantTypeId || grantTypeLabel;
      Logger.log(`   🔍 Grant Type: "${grantTypeLabel}" → ${grantTypeId || grantTypeLabel}`);
    }
    
    const grantStatusLabel = String(rowData[4] || '').trim();
    if (grantStatusLabel) {
      const grantStatusId = grantStatusMap[grantStatusLabel] || grantStatusMap[grantStatusLabel.toLowerCase()];
      payload.grantStatus = grantStatusId || grantStatusLabel;
      Logger.log(`   🔍 Grant Status: "${grantStatusLabel}" → ${grantStatusId || grantStatusLabel}`);
    }
    
    Logger.log(`   Col 2 (Grants): ${rowData[2]}`);
    Logger.log(`   Col 3 (Grant Type): ${rowData[3]}`);
    Logger.log(`   Col 4 (Grant Status): ${rowData[4]}`);
  }
  
  Logger.log(`   Final payload: ${JSON.stringify(payload)}`);
  return payload;
}

/**
 * Build a map of Reason/Change Type labels to their IDs from Bob Lists sheet
 * Also captures the column path for custom fields
 * @param {string} tablePrefix - 'salary', 'work', or 'variable'
 * Returns: { labelMap: {label: id}, columnPath: string }
 */
function buildHistoryReasonListMap_(tablePrefix) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bob Lists');
  if (!sh) {
    Logger.log('⚠️ Bob Lists sheet not found');
    return { labelMap: {}, columnPath: null };
  }
  
  const data = sh.getDataRange().getValues();
  const labelMap = {};
  let columnPath = null;
  
  // Define patterns for each table type
  const patterns = {
    'salary': 'payroll.salary.column_',
    'work': 'work.column_',
    'variable': 'payroll.variable.column_'
  };
  
  const pattern = patterns[tablePrefix] || patterns['salary'];
  Logger.log(`🔍 Scanning Bob Lists for ${tablePrefix} (pattern: ${pattern})...`);
  
  for (let i = 1; i < data.length; i++) {
    const listName = String(data[i][0] || '');
    const valueId = String(data[i][1] || '');
    const valueLabel = String(data[i][2] || '').trim();
    
    // Match the pattern for this table type
    if (listName.includes(pattern)) {
      // Capture the column path (e.g., payroll.salary.column_1764918506367)
      if (!columnPath) {
        columnPath = listName;
        Logger.log(`   📍 Found custom column: ${columnPath}`);
      }
      
      if (valueLabel && valueId) {
        labelMap[valueLabel] = valueId;
        labelMap[valueLabel.toLowerCase()] = valueId;
      }
    }
  }
  
  const uniqueCount = Object.keys(labelMap).filter(k => k !== k.toLowerCase()).length;
  Logger.log(`📋 Built ${tablePrefix} reason map with ${uniqueCount} entries, column: ${columnPath}`);
  
  return { labelMap, columnPath };
}

// Backward compatibility alias
function buildSalaryReasonListMap_() {
  return buildHistoryReasonListMap_('salary');
}

/**
 * Build a simple label-to-ID map for a given list name
 * @param {string} listName - The exact list name to look for (e.g., 'grantTypes', 'grantStatuses')
 * Returns: {label: id} map
 */
function buildListLabelToIdMap_(listName) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bob Lists');
  if (!sh) {
    Logger.log('⚠️ Bob Lists sheet not found');
    return {};
  }
  
  const data = sh.getDataRange().getValues();
  const map = {};
  
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] || '');
    const valueId = String(data[i][1] || '');
    const valueLabel = String(data[i][2] || '').trim();
    
    if (name === listName && valueLabel && valueId) {
      map[valueLabel] = valueId;
      map[valueLabel.toLowerCase()] = valueId;
    }
  }
  
  Logger.log(`📋 Built ${listName} map with ${Object.keys(map).length / 2} entries`);
  return map;
}

/**
 * Test function to debug the reason mapping
 * Run this manually from Apps Script editor
 */
function testReasonMapping() {
  const map = buildHistoryReasonListMap_('salary');
  Logger.log('=== Reason Map Contents ===');
  const uniqueKeys = Object.keys(map).filter(k => k === k.toLowerCase() === false || k === k);
  for (const key of Object.keys(map)) {
    if (key !== key.toLowerCase()) {
      Logger.log(`  "${key}" → ${map[key]}`);
    }
  }
  
  // Test specific lookups
  const testValues = ['Merit Increase', 'Promotion', 'New Hire'];
  Logger.log('=== Test Lookups ===');
  for (const val of testValues) {
    const id = map[val] || map[val.toLowerCase()];
    Logger.log(`  "${val}" → ${id || 'NOT FOUND'}`);
  }
}

function getHistoryEndpoint_(tableType, bobId) {
  const base = CONFIG.HIBOB_BASE_URL;
  if (tableType === 'Salary / Payroll') {
    return `${base}/v1/people/${encodeURIComponent(bobId)}/salaries`;
  } else if (tableType === 'Work History') {
    return `${base}/v1/people/${encodeURIComponent(bobId)}/work`;
  } else if (tableType === 'Variable Pay') {
    // Variable Pay: POST /v1/people/{id}/variable
    // https://apidocs.hibob.com/reference/post_people-id-variable
    return `${base}/v1/people/${encodeURIComponent(bobId)}/variable`;
  } else if (tableType === 'Equity / Grants') {
    return `${base}/v1/people/${encodeURIComponent(bobId)}/equities`;
  }
  return '';
}

function clearBatchHistoryUpload() {
  const props = PropertiesService.getScriptProperties();
  const hadBatch = !!props.getProperty('BATCH_HISTORY_UPLOAD_STATE');
  
  props.deleteProperty('BATCH_HISTORY_UPLOAD_STATE');
  
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'processBatchHistory_') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  if (hadBatch) {
    toast_('🛑 History batch upload stopped and cleared.');
  } else {
    toast_('ℹ️ No history batch was running.');
  }
}

function createBatchHistoryTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'processBatchHistory_') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  ScriptApp.newTrigger('processBatchHistory_')
    .timeBased()
    .everyMinutes(TRIGGER_INTERVAL)
    .create();
}

// ============================================================================
// DOCUMENTATION FUNCTION
// ============================================================================

function createDocumentationSheet() {
  const sh = getOrCreateSheet_(CONFIG.DOCS_SHEET);
  sh.clear();
  
  sh.getRange('A1').setValue('HiBob Data Updater - Complete Guide')
    .setFontSize(18)
    .setFontWeight('bold')
    .setBackground(CONFIG.COLORS.HEADER)
    .setFontColor(CONFIG.COLORS.HEADER_TEXT);
  
  sh.getRange('A2').setValue('Version 2.0 | Last Updated: 2025-10-29')
    .setFontStyle('italic')
    .setFontColor('#666666');
  
  let row = 4;
  formatSectionHeader_(sh.getRange(`A${row}`), '📋 TABLE OF CONTENTS');
  row++;
  
  const toc = [
    ['1. Overview', 'What this tool does and how it works'],
    ['2. Initial Setup', 'One-time configuration steps'],
    ['3. Workflow Steps', 'Step-by-step process for updates'],
    ['4. Function Reference', 'Detailed explanation of each menu item'],
    ['5. Troubleshooting', 'Common issues and solutions'],
    ['6. Best Practices', 'Tips for efficient usage'],
    ['7. API Rate Limits', 'Understanding HiBob API constraints']
  ];
  
  toc.forEach(item => {
    sh.getRange(`A${row}`).setValue(item[0]).setFontWeight('bold');
    sh.getRange(`B${row}`).setValue(item[1]);
    row++;
  });
  
  row += 2;
  
  formatSectionHeader_(sh.getRange(`A${row}`), '1. OVERVIEW');
  row++;
  
  sh.getRange(`A${row}`).setValue('The HiBob Data Updater is a Google Apps Script tool that:');
  row++;
  const overview = [
    '• Pulls employee data, field metadata, and list values from HiBob API',
    '• Allows bulk updates to employee fields via an intuitive spreadsheet interface',
    '• Supports both regular fields and history tables (Salary, Work History, Variable Pay)',
    '• Handles rate limiting and batch processing automatically',
    '• Validates data before upload to prevent errors',
    '• Provides detailed status reporting and error messages'
  ];
  overview.forEach(item => {
    sh.getRange(`A${row}`).setValue(item);
    row++;
  });
  
  row += 2;
  
  formatSectionHeader_(sh.getRange(`A${row}`), '2. INITIAL SETUP (One-Time)');
  row++;
  
  sh.getRange(`A${row}`).setValue('Before using the tool, complete these steps once:');
  row++;
  
  const setup = [
    ['Step', 'Action', 'How To'],
    ['1', 'Get HiBob API Credentials', 'Log in to HiBob → Settings → API → Service Users → Create/Copy credentials'],
    ['2', 'Store Credentials', 'Extensions → Apps Script → Select "setBobServiceUser" → Run → Enter ID and Token'],
    ['3', 'Test Connection', 'Extensions → Apps Script → Select "testBobConnection" → Run → Check logs'],
    ['4', 'Pull Field Metadata', 'Bob menu → Setup → 1. Pull Fields'],
    ['5', 'Pull List Values', 'Bob menu → Setup → 2. Pull Lists'],
    ['6', 'Pull Employee Data', 'Bob menu → Setup → 3. Pull Employees']
  ];
  
  sh.getRange(row, 1, setup.length, setup[0].length).setValues(setup);
  formatHeaderRow_(sh, row, 3);
  row += setup.length + 1;
  
  formatSectionHeader_(sh.getRange(`A${row}`), '3. STANDARD WORKFLOW');
  row++;
  
  const workflow = [
    ['Phase', 'Steps', 'Description'],
    ['SETUP', '1. Select Update Type', 'Choose between Regular Field Update or History Table Update'],
    ['', '2. Setup Uploader Sheet', 'Creates template with appropriate columns and validations'],
    ['', '3. Setup Field Uploader', 'Creates search interface to select field and build upload table'],
    ['VALIDATE', '4. Prepare Data', 'Paste CIQ IDs and new values into the sheet'],
    ['', '5. Run Validation', 'Checks for missing CIQs, blank values, and data quality'],
    ['UPLOAD', '6. Choose Upload Method', 'Quick (<40 rows) or Batch (40-1000+ rows)'],
    ['', '7. Monitor Progress', 'Check status column for real-time updates'],
    ['CLEANUP', '8. Review Results', 'Check completed/skipped/failed counts'],
    ['', '9. Clear Data', 'Clean sheet for next upload (keeps field selection)']
  ];
  
  sh.getRange(row, 1, workflow.length, workflow[0].length).setValues(workflow);
  formatHeaderRow_(sh, row, 3);
  row += workflow.length + 2;
  
  // 4. FUNCTION REFERENCE
  formatSectionHeader_(sh.getRange(`A${row}`), '4. FUNCTION REFERENCE');
  row++;
  
  const functions = [
    ['Menu Item', 'What It Does', 'When To Use'],
    ['', '', ''],
    ['SETUP SECTION', '', ''],
    ['1. Pull Fields', 'Downloads all available field metadata from HiBob', 'Run once initially, then when new fields are added to HiBob'],
    ['2. Pull Lists', 'Downloads dropdown list values (departments, sites, etc.)', 'Run once initially, then when lists are updated in HiBob'],
    ['3. Pull Employees', 'Downloads employee list with CIQ IDs and Bob IDs', 'Run initially, and whenever new employees join or you need terminated employees'],
    ['', '', ''],
    ['REGULAR FIELD UPDATES', '', ''],
    ['4. Setup Field Uploader', 'Creates Uploader sheet with search interface', 'Before updating any regular field - search and select field in one step'],
    ['', '', ''],
    ['HISTORY TABLE UPDATES', '', ''],
    ['6. Setup History Uploader', 'Creates History Uploader sheet with table selector', 'Before updating salary/work/variable pay history'],
    ['7. Generate Columns', 'Creates appropriate columns for selected table type', 'After selecting table type in cell B4'],
    ['', '', ''],
    ['VALIDATION SECTION', '', ''],
    ['8. Validate Data', 'Checks data quality before upload', 'Always run before uploading to catch errors early'],
    ['', '', ''],
    ['UPLOAD SECTION', '', ''],
    ['9. Quick Upload', 'Immediate upload for ≤40 rows', 'For small datasets or urgent updates'],
    ['10. Batch Upload', 'Scheduled upload for 40-1000+ rows (50 rows every min)', 'For large datasets to avoid timeouts'],
    ['11. Retry Failed', 'Re-attempts only failed rows with fresh employee lookup', 'When some rows failed due to missing CIQs or permissions'],
    ['', '', ''],
    ['MONITORING SECTION', '', ''],
    ['12. Check Batch Status', 'Shows progress and ETA for running batch', 'To monitor long-running batch uploads'],
    ['13. Stop Batch', 'Cancels currently running batch upload', 'To stop if you need to make changes'],
    ['', '', ''],
    ['CLEANUP SECTION', '', ''],
    ['14. Clear Upload Data', 'Removes all data rows, keeps field selection', 'After successful upload to prepare for next update']
  ];
  
  sh.getRange(row, 1, functions.length, functions[0].length).setValues(functions);
  formatHeaderRow_(sh, row, 3);
  row += functions.length + 2;
  
  // 5. TROUBLESHOOTING
  formatSectionHeader_(sh.getRange(`A${row}`), '5. TROUBLESHOOTING');
  row++;
  
  const troubleshooting = [
    ['Issue', 'Cause', 'Solution'],
    ['"CIQ not found"', 'Employee not in Employees sheet', 'Change B3 to "All" in Employees sheet, re-run Pull Employees'],
    ['"Permission denied (403)"', 'Service user lacks permissions', 'Check Bob → Settings → API → Service Users → Permissions'],
    ['"Unchanged (304)"', 'Field already has this value', 'This is correct! No update needed. Field already matches.'],
    ['"Missing required field"', 'Empty value in required column', 'Fill in all required fields (marked with *)'],
    ['"Field not found"', 'Field metadata not synced', 'Re-run "1. Pull Fields" from Setup menu'],
    ['Timeout on large upload', 'Too many rows for Quick Upload', 'Use Batch Upload instead (processes 50 rows every min)'],
    ['Wrong dropdown values', 'List values not synced', 'Re-run "2. Pull Lists" from Setup menu']
  ];
  
  sh.getRange(row, 1, troubleshooting.length, troubleshooting[0].length).setValues(troubleshooting);
  formatHeaderRow_(sh, row, 3);
  row += troubleshooting.length + 2;
  
  // 6. BEST PRACTICES
  formatSectionHeader_(sh.getRange(`A${row}`), '6. BEST PRACTICES');
  row++;
  
  const bestPractices = [
    '✅ ALWAYS validate before uploading - catches 90% of issues early',
    '✅ Test with 5-10 rows first before bulk upload',
    '✅ Use "All" employment status to include terminated employees when needed',
    '✅ Check "Verified Value" column after upload to confirm changes',
    '✅ Keep a backup of your data before uploading',
    '✅ Use Batch Upload for >40 rows to avoid timeouts',
    '✅ Clear upload data between different updates to avoid confusion',
    '',
    '⚠️ DON\'T upload without validation',
    '⚠️ DON\'T mix different field updates in one sheet',
    '⚠️ DON\'T upload blank values (will skip)',
    '⚠️ DON\'T modify column headers or structure'
  ];
  
  bestPractices.forEach(item => {
    sh.getRange(`A${row}`).setValue(item);
    if (item.startsWith('✅')) {
      sh.getRange(`A${row}`).setBackground('#D9EAD3');
    } else if (item.startsWith('⚠️')) {
      sh.getRange(`A${row}`).setBackground('#FFF2CC');
    }
    row++;
  });
  
  row += 2;
  
  // 7. API RATE LIMITS
  formatSectionHeader_(sh.getRange(`A${row}`), '7. API RATE LIMITS & TIMING');
  row++;
  
  sh.getRange(`A${row}`).setValue('HiBob API Rate Limits:');
  row++;
  
  const rateLimits = [
    ['Operation', 'Limit', 'Tool Handling'],
    ['PUT /v1/people/{id}', '10 per minute', 'Auto-delays 6 seconds between requests'],
    ['POST /v1/people/{id}/salaries', 'No specific limit', 'Delays 100ms between requests'],
    ['GET /v1/people/search', 'Normal rate limits', 'Single request per employee pull'],
    ['', '', ''],
    ['Batch Processing', '', ''],
    ['Quick Upload', 'Up to 40 rows', 'Processes immediately (~4 minutes max)'],
    ['Batch Upload', '50 rows every minute', 'Auto-scheduled, can handle 1000+ rows (optimized)'],
    ['', '', ''],
    ['Time Estimates', '', ''],
    ['100 rows', '~11 minutes', 'Use Batch Upload'],
    ['250 rows', '~27 minutes', 'Use Batch Upload (optimized timing)'],
    ['500 rows', '~52 minutes', 'Use Batch Upload'],
    ['1000 rows', '~1.7 hours', 'Use Batch Upload, can run overnight']
  ];
  
  sh.getRange(row, 1, rateLimits.length, rateLimits[0].length).setValues(rateLimits);
  formatHeaderRow_(sh, row, 3);
  row += rateLimits.length + 2;
  
  // Visual Guide
  formatSectionHeader_(sh.getRange(`A${row}`), '8. VISUAL GUIDE TO INPUT FIELDS');
  row++;
  
  sh.getRange(`A${row}`).setValue('Color Coding:');
  row++;
  
  sh.getRange(`A${row}`).setValue('YELLOW BACKGROUND = Required Input').setBackground(CONFIG.COLORS.INPUT_REQUIRED);
  row++;
  sh.getRange(`A${row}`).setValue('GRAY BACKGROUND = Optional Input').setBackground(CONFIG.COLORS.INPUT_OPTIONAL);
  row++;
  sh.getRange(`A${row}`).setValue('BLUE HEADER = Column Headers').setBackground(CONFIG.COLORS.HEADER).setFontColor('#FFFFFF');
  row++;
  sh.getRange(`A${row}`).setValue('GREEN = Completed Successfully').setBackground(CONFIG.COLORS.SUCCESS);
  row++;
  sh.getRange(`A${row}`).setValue('YELLOW = Skipped (Unchanged)').setBackground(CONFIG.COLORS.WARNING);
  row++;
  sh.getRange(`A${row}`).setValue('RED = Failed').setBackground(CONFIG.COLORS.ERROR);
  row++;
  sh.getRange(`A${row}`).setValue('LIGHT BLUE = Processing').setBackground(CONFIG.COLORS.INFO);
  row++;
  
  row += 2;
  
  // Quick Reference Card
  formatSectionHeader_(sh.getRange(`A${row}`), '9. QUICK REFERENCE CARD');
  row++;
  
  const quickRef = [
    ['Task', 'Menu Path'],
    ['Update a regular field', 'Setup → 4. Setup Field Uploader → Search field → Paste data → Validate → Upload'],
    ['Update salary history', 'History Tables → Setup History Uploader → Select "Salary/Payroll" → Generate Columns → Paste → Upload'],
    ['Find terminated employee', 'Employees sheet → B3 = "All" → Re-run Pull Employees'],
    ['Check batch progress', 'Upload → Check Batch Status'],
    ['Stop a running batch', 'Upload → Stop Batch Upload'],
    ['Clean up after upload', 'Cleanup → Clear Upload Data']
  ];
  
  sh.getRange(row, 1, quickRef.length, quickRef[0].length).setValues(quickRef);
  formatHeaderRow_(sh, row, 2);
  row += quickRef.length + 2;
  
  // Support
  formatSectionHeader_(sh.getRange(`A${row}`), '10. SUPPORT');
  row++;
  
  sh.getRange(`A${row}`).setValue('For issues or questions:');
  row++;
  sh.getRange(`A${row}`).setValue('1. Check this documentation first');
  row++;
  sh.getRange(`A${row}`).setValue('2. Review the Troubleshooting section above');
  row++;
  sh.getRange(`A${row}`).setValue('3. Check Apps Script logs: Extensions → Apps Script → View → Execution log');
  row++;
  sh.getRange(`A${row}`).setValue('4. Contact your Bob administrator');
  row++;
  
  autoFitAllColumns_(sh);
  
  sh.setColumnWidth(1, 250);
  sh.setColumnWidth(2, 400);
  sh.setColumnWidth(3, 350);
  
  sh.setFrozenRows(1);
  
  toast_('✅ Documentation sheet created!');
}
