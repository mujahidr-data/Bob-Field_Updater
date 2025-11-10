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

function setupUploader() {
  const sh = getOrCreateSheet_(SHEET_UPLOADER);
  
  sh.clear();
  sh.clearNotes();
  const lastRow = sh.getMaxRows();
  const lastCol = sh.getMaxColumns();
  if (lastRow > 0 && lastCol > 0) {
    sh.getRange(1, 1, lastRow, lastCol).clearDataValidations();
  }

  sh.getRange('A1').setValue('Field Uploader - Update Single Field for Multiple Employees')
    .setBackground(CONFIG.COLORS.HEADER)
    .setFontColor(CONFIG.COLORS.HEADER_TEXT)
    .setFontWeight('bold')
    .setFontSize(14);
  sh.getRange('A1:H1').mergeAcross();

  sh.getRange('A2').setValue('INSTRUCTIONS:').setFontWeight('bold').setFontSize(11);
  sh.getRange('A2:H2').mergeAcross();

  const instructions = [
    '1. Click "SETUP -> 5. Select Field to Update" to choose which field to update',
    '2. Paste employee CIQ IDs in column A below (starting row 8)',
    '3. Enter new values in column B',
    '4. Validate with "VALIDATE -> Validate Field Upload Data"',
    '5. Upload with "UPLOAD -> Quick Upload" or "Batch Upload"'
  ];

  instructions.forEach((instr, i) => {
    sh.getRange(3 + i, 1).setValue(instr).setFontStyle('italic').setWrap(true);
    sh.getRange(3 + i, 1, 1, 8).mergeAcross();
  });

  const dataHeaders = ['CIQ ID', 'New Value', 'Bob ID', 'Field Path', 'Status', 'Code', 'Error', 'Verified Value'];
  sh.getRange(7, 1, 1, dataHeaders.length).setValues([dataHeaders]);
  formatHeaderRow_(sh, 7, dataHeaders.length);

  sh.setFrozenRows(7);
  autoFitAllColumns_(sh);
  
  toast_('[OK] Field Uploader sheet ready. Use menu to select a field.');
}

function showFieldSelector() {
  const template = HtmlService.createTemplateFromFile('FieldSelector');
  template.fields = getFieldsForSelector();
  
  const html = template.evaluate()
    .setWidth(800)
    .setHeight(600)
    .setTitle('Select Field to Update');
    
  SpreadsheetApp.getUi().showModalDialog(html, 'Select Field to Update');
}

function getFieldsForSelector() {
  const fields = readFields_();
  return fields
    .filter(f => f.calculated !== 'true' && f.type !== 'object')
    .map(f => ({
      id: f.id,
      name: f.name,
      jsonPath: f.jsonPath,
      type: f.type,
      listName: f.typeData?.listName || ''
    }));
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

// ============================================================================
// VALIDATION
// ============================================================================

function validateUploadData() {
  const ul = getOrCreateSheet_(SHEET_UPLOADER);
  
  const fieldName = normalizeBlank_(ul.getRange('D1').getValue());
  const fieldPath = normalizeBlank_(ul.getRange('E1').getValue());
  
  if (!fieldName || !fieldPath) {
    throw new Error(' No field selected!\n\nUse " SETUP  5. Select Field to Update" first.');
  }
  
  const lastRow = ul.getLastRow();
  if (lastRow < 8) {
    throw new Error(' No data to validate!\n\nAdd employee CIQ IDs and new values starting at row 8.');
  }
  
  const data = ul.getRange(8, 1, lastRow - 7, 2).getValues();
  
  let emptyRows = 0;
  let validRows = 0;
  let issues = [];
  
  data.forEach((row, i) => {
    const ciq = normalizeBlank_(row[0]);
    const newVal = normalizeBlank_(row[1]);
    const rowNum = i + 8;
    
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
  if (lastRow < 8) {
    throw new Error(' No data to upload. Add CIQ IDs and values starting at row 8.');
  }
  
  const dataRows = lastRow - 7;
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
  
  const data = ul.getRange(8, 1, dataRows, 2).getValues();
  const ciqToBobMap = buildCiqToBobMap_();
  
  let listMap = null;
  if (listName) {
    listMap = buildListLabelToId_(listName);
  }
  
  let ok = 0, skip = 0, fail = 0;
  
  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 8;
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
  if (lastRow < 8) {
    throw new Error(' No data to upload.');
  }
  
  const dataRows = lastRow - 7;
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
    nextRow: 8,
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
  const props = PropertiesService.getScriptProperties();
  const stateJson = props.getProperty('BATCH_UPLOAD_STATE');
  
  if (!stateJson) return;
  
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
    return;
  }
  
  const data = ul.getRange(state.nextRow, 1, endRow - state.nextRow + 1, 2).getValues();
  const ciqToBobMap = buildCiqToBobMap_();
  
  let listMap = null;
  if (listName) {
    listMap = buildListLabelToId_(listName);
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
    if (listMap) {
      const hit = listMap[rawNew] || listMap[String(rawNew).toLowerCase()];
      if (hit) newVal = hit;
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
  if (lastRow < 8) {
    throw new Error(' No data to retry.');
  }
  
  const data = ul.getRange(8, 1, lastRow - 7, 5).getValues();
  const ciqToBobMap = buildCiqToBobMap_();
  
  let listMap = null;
  if (listName) {
    listMap = buildListLabelToId_(listName);
  }
  
  let ok = 0, skip = 0, fail = 0;
  
  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 8;
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
  const totalRows = ul.getLastRow() - 7;
  const completed = state.nextRow - 8;
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
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'processBatch') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  ScriptApp.newTrigger('processBatch')
    .timeBased()
    .everyMinutes(TRIGGER_INTERVAL)
    .create();
}

function clearBatchUpload() {
  const props = PropertiesService.getScriptProperties();
  const hadBatch = !!props.getProperty('BATCH_UPLOAD_STATE');
  
  props.deleteProperty('BATCH_UPLOAD_STATE');
  
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'processBatch') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  if (hadBatch) {
    toast_(' Batch upload stopped and cleared.');
  } else {
    toast_(' No batch upload was running.');
  }
}

function clearUploadDataAfterBatch_(stats) {
  const ul = getOrCreateSheet_(SHEET_UPLOADER);
  const lastRow = ul.getLastRow();
  
  if (lastRow <= 7) return;
  
  const dataRows = lastRow - 7;
  
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
    ul.getRange(8, 1, dataRows, ul.getMaxColumns()).clearContent().clearFormat();
    
    if (dataRows > 100) {
      ul.deleteRows(8, dataRows);
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
  
  if (regularSheet && regularSheet.getLastRow() > 7) {
    const dataRows = regularSheet.getLastRow() - 7;
    const maxCols = regularSheet.getMaxColumns();
    
    regularSheet.getRange(8, 1, dataRows, maxCols)
      .clearContent()
      .clearFormat()
      .clearNote()
      .clearDataValidations();
    
    if (dataRows > 100) {
      regularSheet.deleteRows(8, dataRows);
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
        .requireValueInList(['Salary / Payroll', 'Work History', 'Variable Pay'], true)
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
      'Select a table type in B4 first.\n\nChoices: Salary/Payroll, Work History, or Variable Pay',
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
      { name: 'Currency *', required: true, listName: 'Currency' },
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
      { name: 'Site', required: false, listName: 'Site' },
      { name: 'Reports To', required: false, listName: null },
      { name: 'Change Type', required: false, listName: 'Change Type' },
      { name: 'Reason', required: false, listName: null }
    ];
  } else if (tableType === 'Variable Pay') {
    columns = [
      { name: 'CIQ ID', required: true, listName: null },
      { name: 'Effective Date *', required: true, listName: null },
      { name: 'Variable Type', required: false, listName: 'Variable Type' },
      { name: 'Amount', required: false, listName: null },
      { name: 'Pay Period', required: false, listName: null },
      { name: 'Pay Frequency', required: false, listName: null },
      { name: 'Reason', required: false, listName: null }
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
    
    if (column.listName && listMap[column.listName]) {
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
      const payPeriodVals = ['Annual', 'Hourly', 'Daily', 'Weekly', 'Monthly'];
      range.setDataValidation(
        SpreadsheetApp.newDataValidation()
          .requireValueInList(payPeriodVals, true)
          .setHelpText('🔽 Select pay period')
          .build()
      );
    } else if (column.name === 'Pay Frequency') {
      const payFreqVals = ['Monthly', 'Semi Monthly', 'Weekly', 'Bi-Weekly'];
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
    ['', '3. Select Field/Table', 'Choose which field or history table to update'],
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
  
  autoFitAllColumns_(sh);
  
  sh.setColumnWidth(1, 250);
  sh.setColumnWidth(2, 400);
  sh.setColumnWidth(3, 350);
  
  sh.setFrozenRows(1);
  
  toast_('✅ Documentation sheet created!');
}
