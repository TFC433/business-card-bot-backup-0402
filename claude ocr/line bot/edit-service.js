// edit-service.js - 編輯服務 (V2.3 移除網址地址，保留小寫 email)
class EditService {
    constructor() {
        // 欄位映射表
        this.fieldMapping = {
            'name': { key: 'name', label: '姓名' },
            'company': { key: 'company', label: '公司' },
            'position': { key: 'position', label: '職位' },
            'department': { key: 'department', label: '部門' },
            'phone': { key: 'phone', label: '電話' },
            'mobile': { key: 'mobile', label: '手機' },
            'email': { key: 'email', label: 'email' }, // 保留小寫
            'website': { key: 'website', label: '網址' },
            'address': { key: 'address', label: '地址' }
        };

        this.labelToKeyMap = new Map([
            ['姓名', 'name'], 
            ['公司', 'company'], 
            ['職位', 'position'],
            ['部門', 'department'], 
            ['電話', 'phone'], 
            ['手機', 'mobile'],
            ['email', 'email'] // [修改] 移除 '網址' 與 '地址' 的映射
        ]);
        
        // 驗證規則
        this.validationRules = {
            name: { maxLength: 20, pattern: /^[\u4e00-\u9fa5a-zA-Z\s.]+$/, errorMessage: '姓名只能包含中文、英文和空格' },
            company: { maxLength: 100, pattern: /^[\u4e00-\u9fa5a-zA-Z0-9\s.,()（）&-]+$/, errorMessage: '公司名稱包含無效字符' },
            position: { maxLength: 50, pattern: /^[\u4e00-\u9fa5a-zA-Z0-9\s/.-]+$/, errorMessage: '職位名稱包含無效字符' },
            department: { maxLength: 50, pattern: /^[\u4e00-\u9fa5a-zA-Z0-9\s/.-]+$/, errorMessage: '部門名稱包含無效字符' },
            phone: { maxLength: 30, pattern: /^[0-9\s\-()（）+ext分機EXT.]+$/, errorMessage: '電話格式不正確' },
            mobile: { maxLength: 20, pattern: /^[0-9\s\-()（）+]+$/, errorMessage: '手機格式不正確' },
            email: { maxLength: 100, pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, errorMessage: 'email格式不正確' },
            website: { maxLength: 200, pattern: /^(https?:\/\/)?(www\.)?[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}([\/\w\-._~:/?#[\]@!$&'()*+,;=]*)?$/, errorMessage: '網址格式不正確' },
            address: { maxLength: 200, pattern: /^[\u4e00-\u9fa5a-zA-Z0-9\s,.-]+$/, errorMessage: '地址包含無效字符' }
        };
    }
    
    /**
     * 根據標籤名稱取得欄位 key
     * @param {string} label - 按鈕上的標籤 (e.g., "姓名")
     * @returns {string|null} - 對應的 key (e.g., "name")
     */
    getFieldKeyByLabel(label) {
        return this.labelToKeyMap.get(label) || null;
    }

    /**
     * 更新指定欄位的值
     * @param {object} currentData - 當前的名片資料
     * @param {string} fieldKey - 要更新的欄位 key (e.g., "name")
     * @param {string} newValue - 新的值
     * @returns {object} - { success: boolean, data?: object, error?: string }
     */
    updateField(currentData, fieldKey, newValue) {
        // 1. 驗證新值
        const validation = this.validateField(fieldKey, newValue);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        // 2. 建立更新後的資料副本
        const updatedData = { ...currentData };
        updatedData[fieldKey] = newValue.trim();

        console.log(`✏️ 編輯服務: ${fieldKey} 已更新。`);
        return { success: true, data: updatedData };
    }

    // 驗證欄位值
    validateField(fieldKey, value) {
        try {
            if (!value || value.trim() === '') {
                return { valid: false, error: '不能為空值' };
            }
            const trimmedValue = value.trim();
            const rule = this.validationRules[fieldKey];
            if (!rule) return { valid: true };

            if (trimmedValue.length > rule.maxLength) {
                return { valid: false, error: `內容過長（最多${rule.maxLength}字）` };
            }
            if (rule.pattern && !rule.pattern.test(trimmedValue)) {
                return { valid: false, error: rule.errorMessage };
            }
            
            return { valid: true };
            
        } catch (error) {
            console.error('❌ 欄位驗證失敗:', error);
            return { valid: false, error: '驗證時發生錯誤' };
        }
    }
}

module.exports = EditService;
