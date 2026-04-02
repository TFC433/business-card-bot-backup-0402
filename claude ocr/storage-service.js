// storage-service.js - V2.4 (資料夾改用暱稱版)
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// 工具函式：自動處理特殊符號開頭的字串，避免被 Google Sheets 誤判為公式
const formatValueForSheet = (value) => {
    if (typeof value === 'string' && (value.startsWith('+') || value.startsWith('='))) {
        return "'" + value; // 在前面加上單引號，強制試算表將其視為純文字
    }
    return value;
};

class StorageService {
    constructor(authService) {
        this.authService = authService;
        this.drive = null;
        this.sheets = null;
    }

    // 初始化 Google API 服務
    async initializeServices() {
        if (this.drive && this.sheets) return;
        const auth = await this.authService.getOAuthClient();
        if (!auth) {
            throw new Error('OAuth認證失敗');
        }
        this.drive = google.drive({ version: 'v3', auth });
        this.sheets = google.sheets({ version: 'v4', auth });
    }

    // 取得或建立指定的資料夾 ID
    async getOrCreateFolderId(name, parentId) {
        await this.initializeServices();
        
        const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
        const res = await this.drive.files.list({
            q: query,
            fields: 'files(id, name)',
            spaces: 'drive',
        });

        if (res.data.files.length > 0) {
            return res.data.files[0].id;
        }

        const fileMetadata = {
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        };
        const folder = await this.drive.files.create({
            resource: fileMetadata,
            fields: 'id',
        });
        return folder.data.id;
    }
    
    // 上傳檔案到 Google Drive (結構化路徑)
    async uploadToDrive(imagePath, parsedData, userInfo) {
        await this.initializeServices();
        try {
            const now = new Date();
            const year = now.getFullYear().toString();
            const month = String(now.getMonth() + 1).padStart(2, '0') + '-' + now.toLocaleString('en-US', { month: 'long' });
            
            const rootFolderId = config.DRIVE_FOLDER_ID;
            const yearFolderId = await this.getOrCreateFolderId(year, rootFolderId);
            const monthFolderId = await this.getOrCreateFolderId(month, yearFolderId);

            // [修改處] 改用 LINE 暱稱作為資料夾名稱，並過濾特殊符號
            // 防止暱稱含有 / ? < > 等非法路徑字元
            const safeUserName = (userInfo.displayName || '未知用戶').replace(/[\\?%*:|"<>]/g, '');
            const userFolderId = await this.getOrCreateFolderId(safeUserName, monthFolderId);

            const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
            const safeCompany = (parsedData.company || '未知公司').replace(/[\\?%*:|"<>]/g, '');
            const safeName = (parsedData.name || '未知姓名').replace(/[\\?%*:|"<>]/g, '');
            const safePosition = (parsedData.position || '').replace(/[\\?%*:|"<>]/g, '');
            const extension = path.extname(imagePath) || '.jpg';
            
            const smartFileName = `${dateStr}_${safeCompany}_${safeName}_${safePosition}${extension}`;

            const fileMetadata = {
                name: smartFileName,
                parents: [userFolderId],
                description: `由 ${userInfo.displayName} 於 ${now.toISOString()} 上傳`,
            };
            
            const media = {
                mimeType: 'image/jpeg',
                body: fs.createReadStream(imagePath),
            };
            
            const response = await this.drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id,name,webViewLink,createdTime',
            });
            
            return response.data;

        } catch (error) {
            console.error('❌ Drive上傳失敗:', error.message);
            throw error;
        }
    }

    // 更新指定的儲存格列
    async updateSheetRow(rowIndex, data, processingTime, userInfo) {
        await this.initializeServices();
        try {
            // 時間格式維持 ISO 標準
            const now = new Date().toISOString();
            
            const valuesToUpdate = new Array(config.SHEET_HEADERS.length).fill(null);
            const headers = config.SHEET_HEADERS;

            valuesToUpdate[headers.indexOf('時間')] = now;
            if (data.name) valuesToUpdate[headers.indexOf('姓名')] = data.name;
            if (data.company) valuesToUpdate[headers.indexOf('公司')] = data.company;
            if (data.position) valuesToUpdate[headers.indexOf('職位')] = data.position;
            if (data.department) valuesToUpdate[headers.indexOf('部門')] = data.department;
            if (data.phone) valuesToUpdate[headers.indexOf('電話')] = formatValueForSheet(data.phone);
            if (data.mobile) valuesToUpdate[headers.indexOf('手機')] = formatValueForSheet(data.mobile);
            if (data.fax) valuesToUpdate[headers.indexOf('傳真')] = formatValueForSheet(data.fax);
            if (data.email) valuesToUpdate[headers.indexOf('電子郵件')] = data.email;
            if (data.website) valuesToUpdate[headers.indexOf('網址')] = data.website;
            if (data.address) valuesToUpdate[headers.indexOf('地址')] = data.address;
            valuesToUpdate[headers.indexOf('信心度')] = `${data.confidence || 0}%`;
            valuesToUpdate[headers.indexOf('處理時間')] = `${processingTime.toFixed(2)}秒`;
            valuesToUpdate[headers.indexOf('原始文字')] = data.rawText ? data.rawText.replace(/\n/g, ' ') : '';
            valuesToUpdate[headers.indexOf('資料來源')] = data.source || 'unknown';
            valuesToUpdate[headers.indexOf('LINE用戶ID')] = userInfo.userId;
            valuesToUpdate[headers.indexOf('用戶暱稱')] = userInfo.displayName;

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: config.SPREADSHEET_ID,
                range: `A${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [valuesToUpdate] }
            });

            console.log(`✅ Google Sheets 第 ${rowIndex} 列更新成功`);
        } catch (error) {
            console.error('❌ Google Sheets 更新失敗:', error.message);
            throw error;
        }
    }
    
    // 寫入 Google Sheets (新增資料)
    async writeToSheets(data, driveResult, processingTime, imagePath, userInfo, messageId) {
        await this.initializeServices();
        try {
            console.log('📊 新增資料到 Google Sheets...');
            // 時間格式維持 ISO 標準
            const now = new Date().toISOString();
            
            const rowData = [
                now,
                data.name || '',
                data.company || '',
                data.position || '',
                data.department || '',
                formatValueForSheet(data.phone || ''),
                formatValueForSheet(data.mobile || ''),
                formatValueForSheet(data.fax || ''),
                data.email || '',
                data.website || '',
                data.address || '',
                `${data.confidence || 0}%`,
                `${processingTime.toFixed(2)}秒`,
                driveResult ? driveResult.webViewLink : '',
                driveResult ? driveResult.name : '',
                path.basename(imagePath),
                data.rawText ? data.rawText.replace(/\n/g, ' ') : '',
                data.aiAnalysis ? JSON.stringify(data.aiAnalysis) : '',
                data.aiConfidence ? `${data.aiConfidence}%` : '',
                data.source || 'unknown',
                userInfo.userId,
                userInfo.displayName,
                '',
                messageId
            ];

            // 確保表頭存在
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: config.SPREADSHEET_ID,
                range: 'A1',
                valueInputOption: 'RAW',
                resource: {
                    values: [config.SHEET_HEADERS]
                }
            });
            
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: config.SPREADSHEET_ID,
                range: 'A2',
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });
            
            console.log('✅ Google Sheets寫入成功');
        } catch (error) {
            console.error('❌ Google Sheets寫入失敗:', error.message);
            throw error;
        }
    }

    getSheetsUrl() {
        return `https://docs.google.com/spreadsheets/d/${config.SPREADSHEET_ID}`;
    }
}

module.exports = StorageService;
