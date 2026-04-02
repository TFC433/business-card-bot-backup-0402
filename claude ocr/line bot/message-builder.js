// message-builder.js - 訊息格式化器 (V6.5 - 無省略完整版)
const configLine = require('./config-line');

class MessageBuilder {
    constructor() {
        this.maxTextLength = 5000;
    }

    buildMainMenuMessage(nickname) {
        const greeting = nickname ? `🤖 ${nickname} ，您好！` : '🤖 您好！';
        
        return {
            type: 'text',
            text: `${greeting}\n\n我可以為您掃描名片、搜尋聯絡人。\n請點擊下方主選單中的按鈕進行操作，或輸入「選單」隨時呼叫此選單。`,
            quickReply: {
                items: [
                    { type: 'action', action: { type: 'camera', label: '掃描名片' } },
                    { type: 'action', action: { type: 'message', label: '🔍 搜尋聯絡人', text: '搜尋' } },
                    { type: 'action', action: { type: 'message', label: '📋 名片總覽', text: '名片總覽' } }
                ]
            }
        };
    }
    
    buildDuplicateConfirmMessage(existingContact, newScanData) {
        const createFieldComponent = (label, value) => {
            if (!value) return null;
            return {
                type: 'box',
                layout: 'horizontal',
                margin: 'md',
                contents: [
                    { type: 'text', text: label, size: 'sm', color: '#555555', flex: 2 },
                    { type: 'text', text: value, size: 'sm', color: '#333333', flex: 5, wrap: true }
                ]
            };
        };
        
        const newFields = [
            createFieldComponent('📞 電話', newScanData.phone),
            createFieldComponent('📱 手機', newScanData.mobile),
            createFieldComponent('📧 Email', newScanData.email),
        ].filter(Boolean);

        return {
            type: 'flex',
            altText: '發現可能的重複聯絡人',
            contents: {
                type: 'bubble',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    backgroundColor: '#FFA500',
                    paddingAll: '20px',
                    contents: [
                        { type: 'text', text: '🔍 發現重複聯絡人', weight: 'bold', size: 'lg', color: '#FFFFFF' },
                        { type: 'text', text: '資料庫中似乎已存在此人', size: 'sm', color: '#FFFFFF', margin: 'md' }
                    ]
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'lg',
                    contents: [
                        { type: 'text', text: '已存在資料', weight: 'bold', size: 'md' },
                        createFieldComponent('👤 姓名', existingContact.name),
                        createFieldComponent('🏢 公司', existingContact.company),
                        createFieldComponent('💼 職位', existingContact.position),
                        { type: 'separator', margin: 'lg' },
                        { type: 'text', text: '本次掃描到的新資訊', weight: 'bold', size: 'md', margin: 'lg' },
                        ...(newFields.length > 0 ? newFields : [{ type: 'text', text: '(本次未掃描到新的聯絡資訊)', size: 'sm', color: '#888888', margin: 'md' }])
                    ]
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'button',
                            style: 'primary',
                            color: '#1DB446',
                            action: { type: 'message', label: '✅ 更新此人資料', text: `更新 ${existingContact.rowIndex}` }
                        },
                        {
                            type: 'button',
                            style: 'secondary',
                            action: { type: 'message', label: '➕ 強制建立為新聯絡人', text: '強制新增' }
                        },
                        {
                            type: 'button',
                            style: 'link',
                            color: '#A9A9A9',
                            height: 'sm',
                            action: { type: 'message', label: '❌ 取消操作', text: '取消' }
                        }
                    ]
                }
            }
        };
    }
    
    buildStatsMessage(stats) {
        if (stats.total === 0) {
            return { type: 'text', text: '📊 您目前還沒有掃描過任何名片喔！' };
        }
        let bodyContents = [
            { type: 'text', text: '您的個人名片統計', weight: 'bold', size: 'xl' },
            { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm', contents: [
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '總掃描數', color: '#aaaaaa', size: 'sm', flex: 5 }, { type: 'text', text: `${stats.total} 張`, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '首次掃描', color: '#aaaaaa', size: 'sm', flex: 5 }, { type: 'text', text: this.formatDateTime(stats.firstScanDate, true), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '最近掃描', color: '#aaaaaa', size: 'sm', flex: 5 }, { type: 'text', text: this.formatDateTime(stats.lastScanDate, true), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] }
            ]}
        ];
        if (stats.topCompanies && stats.topCompanies.length > 0) {
            bodyContents.push({ type: 'separator', margin: 'xxl' });
            bodyContents.push({ type: 'text', text: '最常掃描公司 Top 3', weight: 'bold', size: 'xl', margin: 'xxl' });
            stats.topCompanies.forEach(company => {
                bodyContents.push({ type: 'box', layout: 'baseline', margin: 'md', contents: [
                    { type: 'text', text: company.name, size: 'sm', color: '#555555', flex: 4, wrap: true },
                    { type: 'text', text: `${company.count} 次`, size: 'sm', color: '#111111', align: 'end', flex: 1 }
                ]});
            });
        }
        return { type: 'flex', altText: '您的個人統計報告', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#FFE600', contents: [ { type: 'text', text: '📊 統計報告', color: '#000000', size: 'lg', weight: 'bold' } ] }, body: { type: 'box', layout: 'vertical', contents: bodyContents }}};
    }

    buildOverviewMessage(sheetUrl) {
        const crmUrl = 'https://tfc-crm-system.onrender.com/leads-view.html';
        
        return { 
            type: 'flex', 
            altText: '名片總覽連結', 
            contents: { 
                type: 'bubble', 
                header: { 
                    type: 'box', 
                    layout: 'vertical', 
                    paddingAll: '20px', 
                    backgroundColor: '#FFE600', 
                    contents: [ { type: 'text', text: '📋 名片總覽', color: '#000000', size: 'lg', weight: 'bold' } ] 
                }, 
                body: { 
                    type: 'box', 
                    layout: 'vertical', 
                    contents: [ 
                        { type: 'text', text: '點擊下方按鈕，即可在瀏覽器中打開完整的FANUC force名片資料庫。', wrap: true, size: 'md' } 
                    ] 
                }, 
                footer: { 
                    type: 'box', 
                    layout: 'vertical', 
                    contents: [ 
                        { type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: '🔗 開啟總覽表', uri: crmUrl } } 
                    ] 
                } 
            } 
        };
    }

    buildEditMenu(data) {
        const createEditField = (label, value, fieldName) => ({ type: 'box', layout: 'horizontal', margin: 'lg', spacing: 'md', alignItems: 'center', contents: [ { type: 'box', layout: 'vertical', flex: 4, contents: [ { type: 'text', text: label, color: '#888888', size: 'sm' }, { type: 'text', text: value || '(無)', color: '#111111', size: 'md', wrap: true, margin: 'xs' } ] }, { type: 'button', action: { type: 'message', label: '編輯', text: fieldName, }, style: 'primary', color: '#909090', height: 'sm', flex: 1, }, ], });
        const fields = [ '姓名', '公司', '職位', '部門', '電話', '手機', 'Email' ].map(fieldName => { const fieldKey = this.getLabelToKeyMap().get(fieldName); return createEditField(fieldName, data[fieldKey], fieldName); }).filter(Boolean);
        return { type: 'flex', altText: '編輯名片資料', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', backgroundColor: '#333333', contents: [{ type: 'text', text: '📝 編輯名片資料', weight: 'bold', color: '#ffffff', size: 'md', margin: 'md' }], paddingAll: '12px' }, body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: fields, }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [ { type: 'button', style: 'primary', color: '#1DB446', action: { type: 'message', label: '✅ 完成儲存', text: '儲存' } }, { type: 'button', style: 'secondary', action: { type: 'message', label: '🔄 放棄修改', text: '重新識別' } } ] } } };
    }
    
    getLabelToKeyMap() {
        return new Map([
            ['姓名', 'name'], ['公司', 'company'], ['職位', 'position'],
            ['部門', 'department'], ['電話', 'phone'], ['手機', 'mobile'],
            ['Email', 'email']
        ]);
    }

    buildResultMessage(data, isEco = false) {
        const confidence = data.confidence || 0;
        const confidenceIcon = this.getConfidenceIcon(confidence);
        const createFieldComponent = (label, value) => { if (!value) return null; return { type: 'box', layout: 'horizontal', margin: 'md', contents: [ { type: 'text', text: label, size: 'sm', color: '#555555', flex: 2 }, { type: 'text', text: value, size: 'sm', color: '#333333', flex: 5, wrap: true } ] }; };
        const fields = [ createFieldComponent('👤 姓名', data.name), createFieldComponent('🏢 公司', data.company), createFieldComponent('💼 職位', data.position), createFieldComponent('📞 電話', data.phone), createFieldComponent('📱 手機', data.mobile), createFieldComponent('📧 Email', data.email), createFieldComponent('🌐 網址', data.website), createFieldComponent('📍 地址', data.address) ].filter(Boolean);
        
        const footerButtons = [ 
            { type: 'button', style: 'primary', color: '#333333', height: 'sm', action: { type: 'message', label: '✅ 儲存', text: '儲存' } }, 
            { type: 'button', style: 'secondary', height: 'sm', color: '#888888', action: { type: 'message', label: '✏️ 編輯', text: '編輯' } } 
        ];

        if (isEco) {
            footerButtons.push({ type: 'text', text: '🍃 目前運行於 Eco 模式', size: 'xxs', color: '#aaaaaa', align: 'center', margin: 'sm' });
        }

        return { 
            type: 'flex', 
            altText: `名片辨識完成：${data.name || ''}`, 
            contents: { 
                type: 'bubble', 
                header: { 
                    type: 'box', 
                    layout: 'vertical', 
                    paddingAll: '20px', 
                    backgroundColor: '#FFE600', 
                    contents: [ 
                        { type: 'text', text: '掃描完成！', color: '#000000', size: 'lg', weight: 'bold' }, 
                        { type: 'text', text: `綜合信心度: ${confidence}% ${confidenceIcon}`, color: '#333333', size: 'sm', margin: 'md' } 
                    ] 
                }, 
                body: { type: 'box', layout: 'vertical', spacing: 'md', contents: fields }, 
                footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footerButtons } 
            }, 
            quickReply: { items: [ { type: 'action', action: { type: 'message', label: '🔄 重新識別', text: '重新識別' } } ] }
        };
    }

    buildSearchResults(results, keyword) {
        if (results.length === 0) { return { type: 'text', text: `🔍 抱歉，找不到任何與「${keyword}」相關的記錄。`, quickReply: this.cancelSearchQuickReply }; }
        const bubbles = results.map((item, index) => ({ type: 'bubble', size: 'micro', header: { type: 'box', layout: 'vertical', backgroundColor: '#333333', contents: [ { type: 'text', text: `結果 ${index + 1}`, color: '#ffffff', size: 'sm' } ] }, body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [ { type: 'text', text: item.name || '(未知姓名)', weight: 'bold', size: 'md', wrap: true }, { type: 'text', text: item.company || '(未知公司)', size: 'xs', color: '#888888', wrap: true }, { type: 'text', text: item.position || ' ', size: 'xs', color: '#888888', wrap: true } ] }, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'button', style: 'link', height: 'sm', action: { type: 'message', label: '查看詳情', text: `查看${item.rowIndex}` } } ] }}));
        return { type: 'flex', altText: `為您找到 ${results.length} 筆關於「${keyword}」的結果`, contents: { type: 'carousel', contents: bubbles }, quickReply: this.cancelSearchQuickReply };
    }

    buildContactDetail(contact) {
        const createFieldComponent = (label, value) => { if (!value) return null; return { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: label, color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: value, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] }; };
        const fields = [ createFieldComponent('公司', contact.company), createFieldComponent('職位', contact.position), createFieldComponent('部門', contact.department), createFieldComponent('電話', contact.phone), createFieldComponent('手機', contact.mobile), createFieldComponent('Email', contact.email), createFieldComponent('網址', contact.website), createFieldComponent('地址', contact.address), ].filter(Boolean);
        const footerButtons = [];
        if (contact.driveLink) { footerButtons.push({ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: '📸 查看原始名片', uri: contact.driveLink } }); }
        return { type: 'flex', altText: `聯絡人詳情：${contact.name || ''}`, contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: contact.name || '聯絡人詳情', weight: 'bold', size: 'xl' }, { type: 'separator', margin: 'md' }, { type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm', contents: fields }, { type: 'separator', margin: 'md' }, { type: 'text', text: `建立於 ${this.formatDateTime(contact.createdTime)}`, size: 'xs', color: '#aaaaaa', margin: 'md' } ] }, footer: footerButtons.length > 0 ? { type: 'box', layout: 'vertical', spacing: 'sm', contents: footerButtons } : undefined }, quickReply: this.cancelSearchQuickReply };
    }

    buildSaveSuccessMessage(driveLink) { 
        let text = '✅ 資料儲存成功！\n\n'; 
        text += '所有資訊已歸檔至 [ FANUC force潛在客戶總覽 ] 中。\n\n'; 
        text += '📸 您的名片圖片已同步備份至雲端。\n';
        text += '🔗 點擊查看：https://tfc-crm-system.onrender.com/leads-view.html\n\n';
        text += '您可以繼續掃描下一張名片。'; 
        return { type: 'text', text: text }; 
    }

    buildSaveFailedMessage(error = '未知的錯誤') { let text = '❌ 資料儲存失敗\n\n'; text += `原因：${error}\n\n`; text += '資料尚未被儲存，請檢查您的 Google 服務權限或稍後再試。'; return { type: 'text', text: text, quickReply: { items: [ { type: 'action', action: { type: 'message', label: '🔄 再試一次', text: '儲存' }}, { type: 'action', action: { type: 'message', label: '重新識別', text: '重新識別' }} ] } }; }
    buildUpdatedResult(fieldLabel, newValue) { return { type: 'text', text: `✅ ${fieldLabel} 已更新為：\n${newValue}\n\n您可以繼續修改其他欄位，或點選下方按鈕完成儲存。`, quickReply: { items: [ { type: 'action', action: { type: 'message', label: '✏️ 返回編輯', text: '編輯' } }, { type: 'action', action: { type: 'message', label: '✅ 確認儲存', text: '儲存' } } ] } }; }
    buildSearchPromptMessage() { return { type: 'text', text: '🔍 已進入搜尋模式，請輸入您想查詢的姓名或公司。\n\n（或點選下方按鈕退出）', quickReply: this.cancelSearchQuickReply }; }
    get cancelSearchQuickReply() { return { items: [{ type: 'action', action: { type: 'message', label: '❌ 取消搜尋', text: '取消' } }] }; }
    getConfidenceIcon(confidence) { if (confidence >= 85) return '🟢'; if (confidence >= 65) return '🟡'; return '🟠'; }
    formatDateTime(dateString, isDateOnly = false) {
        try {
            const date = new Date(dateString);
            if (isDateOnly) return date.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
            return date.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
        } catch (error) { return dateString; }
    }
}

module.exports = MessageBuilder;
