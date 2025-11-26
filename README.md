# HiBob Field Updater - Google Apps Script

Comprehensive automation tool for managing employee data in HiBob (Bob) HR platform via Google Sheets.

## Overview

The HiBob Field Updater is a Google Apps Script tool that allows you to:
- Pull employee data, field metadata, and list values from HiBob API
- Update single fields for multiple employees in bulk
- Update history tables (Salary, Work History, Variable Pay)
- Validate data before uploading to prevent errors
- Handle rate limiting and batch processing automatically

## Files

- **bob-fieldupdater.gs**: Main Apps Script file with all functionality (1,346 lines)
- **FieldSelector.html**: HTML template for the field selection dialog

## Apps Script Project

- **Project ID**: `1h-FU7zztCagQCg-dphdtkayh0P9qeoW5kFWFX6h9D4L9Usqj9ksKlt8v`
- **Project URL**: https://script.google.com/d/1h-FU7zztCagQCg-dphdtkayh0P9qeoW5kFWFX6h9D4L9Usqj9ksKlt8v/edit

## Setup

### 1. Configure Credentials

1. Open the Apps Script project
2. Run `setBobServiceUser(id, token)` function
3. Enter your HiBob service user ID and token
4. Test connection with `testBobConnection()`

### 2. Initial Setup (One-Time)

1. **Pull Fields**: Bob menu → SETUP → 1. Pull Fields
2. **Pull Lists**: Bob menu → SETUP → 2. Pull Lists
3. **Pull Employees**: Bob menu → SETUP → 3. Pull Employees

## Usage

### Standard Workflow

1. **Select Field**: Bob menu → SETUP → 5. Select Field to Update
2. **Enter Data**: Paste CIQ IDs and new values in Uploader sheet (starting row 8)
3. **Validate**: Bob menu → VALIDATE → Validate Field Upload Data
4. **Upload**: 
   - Quick Upload (<40 rows): Bob menu → UPLOAD → Quick Upload
   - Batch Upload (40-1000+ rows): Bob menu → UPLOAD → Batch Upload

## Version

**Version 2.0** - Last Updated: 2025-10-29

## Documentation

Run `createDocumentationSheet()` or use Bob menu → >> View Documentation to create a comprehensive guide sheet in your Google Spreadsheet.

