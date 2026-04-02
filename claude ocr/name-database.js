// name-database.js - 通用姓名驗證與語義分析模組 (重構版)
const config = require('./config');

class NameDatabase {
    constructor() {
        this.surnames = new Set();
        this.commonNames = new Set();
        this.compoundSurnames = new Set();
        this.rareSurnames = new Set();
        this.englishNames = new Set();
        this.pinyinMapping = new Map();
        this.invalidNameChars = new Set();
        this.companyKeywords = new Set();
        this.positionKeywords = new Set();
        this.departmentKeywords = new Set();
        
        // 新增：語義分析相關
        this.exclusionPatterns = [];
        this.namePatterns = [];
        this.confidenceRules = [];
        
        this.initializeDatabase();
    }

    initializeDatabase() {
        this.loadSurnames();
        this.loadCommonNames();
        this.loadCompoundSurnames();
        this.loadPinyinMapping();
        this.loadEnglishNames();
        this.loadInvalidChars();
        this.loadCompanyKeywords();
        this.loadPositionKeywords();
        this.loadDepartmentKeywords();
        this.setupSemanticRules();
    }

    // === 核心姓名驗證 (重構版) ===
    validateChineseName(name) {
        if (!name || name.length < 2 || name.length > 4) {
            return { valid: false, confidence: 0, reason: '長度不符合中文姓名規範' };
        }

        if (!/^[\u4e00-\u9fa5]+$/.test(name)) {
            return { valid: false, confidence: 0, reason: '包含非中文字符' };
        }

        // 通用排除檢查
        if (this.isSemanticExclusion(name)) {
            return { valid: false, confidence: 0, reason: '語義排除：非姓名用詞' };
        }

        // 計算置信度
        const confidence = this.calculateNameConfidence(name);
        const threshold = this.getConfidenceThreshold(name.length);
        
        const valid = confidence >= threshold;
        return { 
            valid, 
            confidence: Math.min(confidence, 95), 
            reason: valid ? '通過語義驗證' : `置信度不足 (${confidence} < ${threshold})`
        };
    }

    calculateNameConfidence(name) {
        let confidence = 0;
        const firstChar = name.charAt(0);
        const restChars = name.slice(1);

        // 姓氏評分 (40% 權重)
        if (this.isCommonSurname(firstChar)) {
            confidence += 35;
        } else if (this.isSurname(firstChar)) {
            confidence += 25;
        } else if (this.isRareSurname(firstChar)) {
            confidence += 15;
        } else {
            // 非姓氏字符的懲罰
            confidence -= 20;
        }

        // 名字部分評分 (30% 權重)
        let nameScore = 0;
        for (let char of restChars) {
            if (this.commonNames.has(char)) {
                nameScore += 8;
            } else if (this.isValidNameChar(char)) {
                nameScore += 3;
            } else {
                nameScore -= 5;
            }
        }
        confidence += Math.min(nameScore, 25);

        // 長度合理性 (15% 權重)
        const lengthScore = this.getLengthScore(name.length);
        confidence += lengthScore;

        // 語義一致性 (15% 權重)
        const semanticScore = this.getSemanticScore(name);
        confidence += semanticScore;

        return Math.max(0, confidence);
    }

    getLengthScore(length) {
        switch(length) {
            case 2: return 12; // 常見兩字姓名
            case 3: return 15; // 最常見三字姓名
            case 4: return 8;  // 較少見四字姓名
            default: return 0;
        }
    }

    getSemanticScore(name) {
        let score = 0;
        
        // 檢查是否包含明顯的非姓名語義
        const businessChars = ['部', '課', '科', '組', '室', '廳', '局', '署'];
        const locationChars = ['市', '縣', '區', '路', '街', '號', '樓'];
        const techChars = ['技', '術', '程', '系', '統', '網', '碼'];
        
        if (businessChars.some(char => name.includes(char))) score -= 15;
        if (locationChars.some(char => name.includes(char))) score -= 15;
        if (techChars.some(char => name.includes(char))) score -= 10;
        
        // 檢查是否符合姓名語義模式
        if (this.hasNameSemantics(name)) score += 10;
        
        return score;
    }

    hasNameSemantics(name) {
        // 常見姓名語義組合
        const positivePatterns = [
            /[美麗雅淑]/, // 常見女性名用字
            /[俊偉強勇]/, // 常見男性名用字
            /[志明建成]/, // 常見名字組合
            /[家豪文華]/, // 流行名字元素
        ];
        
        return positivePatterns.some(pattern => pattern.test(name));
    }

    getConfidenceThreshold(length) {
        // 根據名字長度動態調整門檻
        switch(length) {
            case 2: return 45; // 兩字名需要更高置信度
            case 3: return 35; // 三字名標準門檻
            case 4: return 40; // 四字名稍高門檻
            default: return 50;
        }
    }

    // === 語義排除系統 ===
    isSemanticExclusion(text) {
        // 檢查是否匹配排除模式
        for (let pattern of this.exclusionPatterns) {
            if (pattern.test && pattern.test(text)) return true;
            if (typeof pattern === 'string' && text.includes(pattern)) return true;
        }
        
        // 檢查特定類別的排除
        return this.isBusinessTerm(text) || 
               this.isLocationTerm(text) || 
               this.isTechnicalTerm(text) ||
               this.isContactTerm(text);
    }

    isBusinessTerm(text) {
        const businessTerms = [
            '公司', '企業', '集團', '工業', '科技', '貿易', '建設', '投資',
            '部門', '部', '課', '科', '組', '室', '處', '廳', '局', '署',
            '營業', '業務', '財務', '人事', '行政', '資訊', '研發', '技術',
            '總經理', '經理', '副理', '協理', '主任', '專員', '助理'
        ];
        return businessTerms.some(term => text.includes(term));
    }

    isLocationTerm(text) {
        const locationTerms = [
            '台灣', '台北', '台中', '台南', '高雄', '桃園', '新竹', '彰化',
            '市', '縣', '區', '鄉', '鎮', '村', '里', '路', '街', '巷', '弄',
            '號', '樓', '層', '室', '西屯', '工業', '園區'
        ];
        return locationTerms.some(term => text.includes(term));
    }

    isTechnicalTerm(text) {
        const techTerms = [
            '技術', '工程', '系統', '網路', '軟體', '硬體', '程式', '資料',
            '統一', '編號', '代碼', '序號', '版本'
        ];
        return techTerms.some(term => text.includes(term));
    }

    isContactTerm(text) {
        const contactTerms = [
            '電話', '手機', '傳真', '地址', '郵件', '信箱', '網址', '分機'
        ];
        return contactTerms.some(term => text.includes(term));
    }

    // === 增強的拼音匹配 ===
    findChineseByPinyin(englishText) {
        const candidates = [];
        const lowerText = englishText.toLowerCase();

        for (let [chinese, pinyins] of this.pinyinMapping) {
            for (let pinyin of pinyins) {
                const matchStrength = this.calculatePinyinMatch(lowerText, pinyin);
                if (matchStrength > 0) {
                    candidates.push({
                        chinese: chinese,
                        pinyin: pinyin,
                        confidence: 60 + matchStrength,
                        reason: `拼音匹配: ${pinyin} → ${chinese} (強度:${matchStrength})`
                    });
                }
            }
        }

        return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
    }

    calculatePinyinMatch(englishText, pinyin) {
        if (pinyin.length < 2) return 0;
        
        let strength = 0;
        
        // 完全匹配
        if (englishText === pinyin) strength += 40;
        
        // 包含匹配
        else if (englishText.includes(pinyin)) strength += 25;
        
        // 開頭匹配
        else if (englishText.startsWith(pinyin)) strength += 20;
        
        // 結尾匹配
        else if (englishText.endsWith(pinyin)) strength += 15;
        
        // 長度加分
        if (pinyin.length >= 4) strength += 5;
        
        return strength;
    }

    // === 公司識別增強 ===
    isCompanyLine(text) {
        return this.calculateCompanyScore(text) >= 60;
    }

    calculateCompanyScore(text) {
        let score = 20;
        
        // 公司關鍵字
        const companyIndicators = [
            { patterns: ['Corporation', 'Company', 'Group', 'Ltd', 'Inc'], weight: 35 },
            { patterns: ['公司', '企業', '集團'], weight: 35 },
            { patterns: ['科技', '工業', '技術', '貿易'], weight: 25 },
            { patterns: ['Systems', 'Solutions', 'Technology'], weight: 25 },
            { patterns: ['有限', '股份'], weight: 30 }
        ];
        
        for (let indicator of companyIndicators) {
            for (let pattern of indicator.patterns) {
                if (text.toLowerCase().includes(pattern.toLowerCase())) {
                    score += indicator.weight;
                    break;
                }
            }
        }
        
        // 長度合理性
        if (text.length >= 6 && text.length <= 50) score += 15;
        else if (text.length < 6) score -= 20;
        
        // 排除明顯非公司的文字
        if (this.isObviouslyNotCompany(text)) score -= 30;
        
        return Math.min(score, 95);
    }

    isObviouslyNotCompany(text) {
        return /^\d+$/.test(text) || 
               /@/.test(text) || 
               /https?:\/\//.test(text) ||
               /^[A-Z]{1,3}$/.test(text) ||
               this.isSurname(text.charAt(0)) && text.length <= 4;
    }

    // === 電話號碼提取 (通用版) ===
    extractPhoneNumbers(text) {
        const result = {
            mobile: [],
            landline: [],
            fax: []
        };
        
        // 手機號碼 (更寬鬆的匹配)
        const mobilePatterns = [
            /09\d{2}[\s\-–—]?\d{3}[\s\-–—]?\d{3}/g,
            /\+886[\s\-–—]?9\d{2}[\s\-–—]?\d{3}[\s\-–—]?\d{3}/g
        ];
        
        for (let pattern of mobilePatterns) {
            const matches = text.match(pattern);
            if (matches) {
                result.mobile.push(...matches.map(m => m.replace(/[\s\-–—]/g, '')));
            }
        }
        
        // 市話號碼 (通用格式)
        const landlinePatterns = [
            /\([0○〇零]\d{1,2}\)\s*\d{3,4}[\-–—]\d{4}(?:\s*(?:分機|ext)\s*\d+)?/g,
            /0\d{1,2}[\-–—]\d{3,4}[\-–—]\d{4}/g,
            /(?:電話|TEL|Tel)[：:\s]*([0○〇零]\d{1,2}[\-–—]\d{3,4}[\-–—]\d{4})/gi
        ];
        
        for (let pattern of landlinePatterns) {
            const matches = text.match(pattern);
            if (matches) {
                result.landline.push(...matches.map(m => 
                    m.replace(/^(?:電話|TEL|Tel)[：:\s]*/, '').trim()
                ));
            }
        }
        
        // 傳真號碼
        const faxPattern = /(?:FAX|傳真|Fax)[：:\s]*([+\d\s\-–—\(\)]+)/gi;
        const faxMatches = text.match(faxPattern);
        if (faxMatches) {
            result.fax.push(...faxMatches.map(m => 
                m.replace(/^(?:FAX|傳真|Fax)[：:\s]*/, '').trim()
            ));
        }
        
        return result;
    }

    // === 設置語義規則 ===
    setupSemanticRules() {
        // 排除模式
        this.exclusionPatterns = [
            /^\d+$/, // 純數字
            /@/, // 包含@符號
            /https?:\/\//, // 網址
            /電話|傳真|手機|地址|郵件/, // 聯絡資訊標籤
            /統一編號|發票|序號/, // 編號相關
            /^\w{1,3}$/, // 太短的英文
        ];
        
        // 姓名模式
        this.namePatterns = [
            { pattern: /^[\u4e00-\u9fa5]{2,4}$/, type: 'chinese', confidence: 60 },
            { pattern: /^[A-Z][a-z]+ [A-Z][a-z]+$/, type: 'english', confidence: 70 },
            { pattern: /^[A-Z][a-z]+ [A-Z]\.$/, type: 'english_initial', confidence: 65 }
        ];
    }

    // === 資料載入方法 (保持現有邏輯，但增強覆蓋率) ===
    loadSurnames() {
        // 台灣前100大姓氏 (擴充版)
        const top100Surnames = [
            // 前20大姓 (覆蓋約70%人口)
            '陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊',
            '許', '鄧', '蕭', '馮', '曾', '程', '蘇', '丁', '朱', '潘',
            // 21-50名
            '范', '董', '梁', '賴', '徐', '葉', '郭', '廖', '謝', '邱',
            '何', '羅', '高', '周', '趙', '孫', '龍', '江', '施', '沈',
            // 51-100名 (擴充更多姓氏)
            '余', '盧', '胡', '姚', '方', '宋', '范', '鄧', '朝', '傅',
            '侯', '曹', '薛', '丁', '唐', '馬', '董', '溫', '石', '紀',
            '姚', '康', '白', '邵', '謝', '覃', '田', '凌', '袁', '湯',
            '邸', '巫', '尤', '阮', '黎', '塗', '伍', '韋', '申', '龐',
            '古', '夏', '柳', '邵', '倪', '莊', '劉', '歐', '鍾', '魏'
        ];
        
        top100Surnames.forEach(surname => this.surnames.add(surname));
        
        // 載入config中的姓氏
        if (config.COMMON_SURNAMES) {
            config.COMMON_SURNAMES.forEach(surname => this.surnames.add(surname));
        }

        // 罕見但存在的姓氏
        const rareSurnames = [
            '令狐', '端木', '呼延', '皇甫', '宇文', '尉遲', '公孫', '夏侯',
            '龍離', '長孫', '慕容', '司徒', '司空', '第五', '包', '左',
            '花', '魯', '鮑', '鄭', '穆', '邢', '蒲', '戎', '谷', '常',
            '閻', '練', '盛', '鄔', '耿', '趙', '符', '申', '祝', '繆'
        ];
        rareSurnames.forEach(surname => this.rareSurnames.add(surname));
    }

    loadCommonNames() {
        // 載入config中的名字用字
        if (config.COMMON_NAME_CHARS) {
            config.COMMON_NAME_CHARS.forEach(char => this.commonNames.add(char));
        }

        // 各世代流行名字 (大幅擴充)
        const generationalNames = {
            traditional: [
                '淑', '芬', '惠', '美', '玲', '麗', '秀', '鳳', '雪', '月',
                '家', '豪', '志', '明', '俊', '傑', '建', '宏', '剛', '峰',
                '淑', '芳', '玉', '珠', '蘭', '菊', '梅', '桂', '英', '華'
            ],
            modern: [
                '雅', '婷', '怡', '君', '宜', '欣', '佳', '雯', '蓉', '純',
                '承', '恩', '宥', '廷', '哲', '翰', '宗', '翰', '冠', '宇',
                '慧', '儀', '萱', '琪', '瑜', '穎', '安', '心', '語', '涵'
            ],
            contemporary: [
                '子', '晴', '詩', '嘉', '妍', '苡', '蕊', '雨', '霏', '晨',
                '宸', '樂', '碩', '翔', '宥', '廷', '承', '翰', '博', '宇',
                '筱', '羽', '恩', '彤', '萍', '悅', '芸', '希', '恬', '澄'
            ]
        };
        
        Object.values(generationalNames).forEach(nameArray => {
            nameArray.forEach(name => this.commonNames.add(name));
        });
    }

    loadCompoundSurnames() {
        // 複姓 (傳統 + 台灣特有)
        const compoundSurnames = [
            // 傳統複姓
            '司馬', '上官', '歐陽', '夏侯', '諸葛', '聞人', '東方', 
            '赫連', '皇甫', '尉遲', '公羊', '澹台', '公冶', '宗政', 
            '令狐', '長孫', '慕容', '司徒', '司空',
            // 台灣雙姓組合
            '張簡', '歐陽', '范姜', '周黃', '張廖', '張許', '張李', 
            '徐邸', '葉劉', '呂蕭', '王曹', '陳林', '陳劉', '蔡王'
        ];
        
        compoundSurnames.forEach(surname => this.compoundSurnames.add(surname));
    }

    loadPinyinMapping() {
        // 大幅擴充拼音對照表
        const mapping = {
            // 常見姓氏拼音
            '陳': ['chen', 'chan', 'tan', 'chin'], 
            '林': ['lin', 'lam', 'lim'], 
            '黃': ['huang', 'wong', 'ng', 'hwang'], 
            '張': ['chang', 'zhang', 'cheung', 'chong'],
            '李': ['li', 'lee', 'lai'], 
            '王': ['wang', 'wong', 'ong'], 
            '吳': ['wu', 'ng', 'goh'], 
            '劉': ['liu', 'lau', 'low'],
            '蔡': ['tsai', 'cai', 'choi'], 
            '楊': ['yang', 'yeung', 'yong'],
            '許': ['hsu', 'xu', 'hui'], 
            '鄧': ['cheng', 'zheng', 'teng'],
            '謝': ['hsieh', 'tse', 'xie', 'sia'], 
            '郭': ['kuo', 'kwok', 'guo'],
            '洪': ['hung', 'hong', 'ang'], 
            '邱': ['chiu', 'qiu', 'khoo'],
            '曾': ['tseng', 'zeng', 'chan'], 
            '廖': ['liao', 'liu', 'liaw'],
            '賴': ['lai', 'lay', 'lye'], 
            '徐': ['hsu', 'xu', 'chee'],
            '周': ['chou', 'chow', 'zhou'], 
            '葉': ['yeh', 'ye', 'ip'],
            '蘇': ['su', 'soo', 'so'], 
            '莊': ['chuang', 'zhuang', 'chong'],
            '呂': ['lu', 'lui', 'lee'], 
            '江': ['chiang', 'jiang', 'kang'],
            '何': ['ho', 'he', 'hoh'], 
            '蕭': ['hsiao', 'siu', 'siao'],
            '羅': ['luo', 'law', 'lo'], 
            '高': ['kao', 'gao', 'ko'],
            
            // 常見名字拼音
            '志': ['chih', 'zhi', 'chi'], 
            '明': ['ming', 'min'], 
            '豪': ['hao', 'ho'],
            '偉': ['wei', 'wai'], 
            '強': ['chiang', 'qiang'], 
            '建': ['chien', 'jian'],
            '成': ['cheng', 'chen'], 
            '文': ['wen', 'man'], 
            '華': ['hua', 'wah'],
            '美': ['mei', 'may'], 
            '麗': ['li', 'lai'], 
            '秀': ['hsiu', 'xiu'],
            '芬': ['fen', 'fun'], 
            '玲': ['ling', 'lin'], 
            '雅': ['ya', 'nga'],
            '婷': ['ting', 'tin'], 
            '怡': ['yi', 'yee'], 
            '君': ['chun', 'jun']
        };

        for (let [chinese, pinyins] of Object.entries(mapping)) {
            this.pinyinMapping.set(chinese, pinyins);
        }
    }

    loadEnglishNames() {
        // 擴充英文名字資料庫
        const englishNames = [
            // 男性名字
            'John', 'David', 'Michael', 'Robert', 'William', 'James', 'Charles', 'Joseph',
            'Thomas', 'Christopher', 'Daniel', 'Paul', 'Mark', 'Donald', 'Steven', 'Kenneth',
            'Andrew', 'Joshua', 'Kevin', 'Brian', 'George', 'Edward', 'Ronald', 'Timothy',
            'Jason', 'Jeffrey', 'Ryan', 'Jacob', 'Gary', 'Nicholas', 'Eric', 'Jonathan',
            // 女性名字
            'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica',
            'Sarah', 'Karen', 'Nancy', 'Lisa', 'Betty', 'Helen', 'Sandra', 'Donna',
            'Carol', 'Ruth', 'Sharon', 'Michelle', 'Laura', 'Sarah', 'Kimberly', 'Deborah',
            'Dorothy', 'Lisa', 'Nancy', 'Karen', 'Betty', 'Helen', 'Sandra', 'Donna',
            // 台灣常見英文名
            'Andy', 'Tony', 'Kevin', 'Eric', 'Alex', 'Jack', 'Tom', 'Peter',
            'Amy', 'Jenny', 'Grace', 'Helen', 'Kelly', 'Nancy', 'Annie', 'Cindy'
        ];
        englishNames.forEach(name => this.englishNames.add(name));
    }

    loadInvalidChars() {
        const invalid = [
            // 業務相關
            '部', '課', '科', '技', '營', '業', '務', '司', '局', '署', '廳', '處',
            // 地理相關  
            '路', '號', '街', '市', '縣', '區', '鄉', '鎮', '村', '里', '巷', '弄', '樓', '層',
            // 技術相關
            '統', '編', '碼', '號', '版', '型', '系', '網', '程', '式', '料', '據',
            // 聯絡相關
            '話', '機', '電', '傳', '真', '址', '件', '箱', '網', '站',
            // 符號數字
            '○', '〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'
        ];
        invalid.forEach(char => this.invalidNameChars.add(char));
    }

    loadCompanyKeywords() {
        const keywords = [
            // 英文
            'CORPORATION', 'COMPANY', 'GROUP', 'TECHNOLOGY', 'ENGINEERING',
            'SYSTEMS', 'SOLUTIONS', 'SERVICES', 'INTERNATIONAL', 'GLOBAL',
            'LIMITED', 'INCORPORATED', 'INDUSTRIAL', 'MANUFACTURING',
            // 中文
            '公司', '企業', '集團', '科技', '工業', '貿易', '開發', '建設', '投資',
            '有限', '股份', '責任', '合作', '聯合', '國際', '全球', '亞洲'
        ];
        keywords.forEach(keyword => this.companyKeywords.add(keyword));
    }

    loadPositionKeywords() {
        const keywords = [
            // 英文職位
            'MANAGER', 'DIRECTOR', 'ENGINEER', 'SENIOR', 'CHIEF', 'PRESIDENT',
            'VICE', 'ASSISTANT', 'CONSULTANT', 'SPECIALIST', 'COORDINATOR',
            // 中文職位
            '總經理', '副總經理', '執行長', '總監', '副總監', '經理', '副經理',
            '協理', '主任', '副主任', '部長', '課長', '組長', '專員', '助理',
            '工程師', '資深工程師', '主任工程師', '顧問', '專案經理', '業務經理'
        ];
        keywords.forEach(keyword => this.positionKeywords.add(keyword));
    }

    loadDepartmentKeywords() {
        const keywords = [
            // 英文部門
            'DEPARTMENT', 'DIVISION', 'SECTION', 'CENTER', 'OFFICE',
            // 中文部門
            '部', '課', '科', '組', '室', '處', '廳', '局', '署', '中心', '辦公室'
        ];
        keywords.forEach(keyword => this.departmentKeywords.add(keyword));
    }

    // === 保持現有的公共方法介面 ===
    isSurname(char) {
        return this.surnames.has(char) || this.compoundSurnames.has(char);
    }

    isCommonSurname(char) {
        return config.COMMON_SURNAMES ? config.COMMON_SURNAMES.includes(char) : false;
    }

    isRareSurname(char) {
        return this.rareSurnames.has(char);
    }

    isValidNameChar(char) {
        return /[\u4e00-\u9fa5]/.test(char) && 
               !this.invalidNameChars.has(char) && 
               !/\d/.test(char);
    }

    isCompanyKeyword(text) {
        const upperText = text.toUpperCase();
        return Array.from(this.companyKeywords).some(keyword => 
            upperText.includes(keyword.toUpperCase())
        );
    }

    // === 統計與分析方法 ===
    getStatistics() {
        return {
            totalSurnames: this.surnames.size,
            totalCommonNames: this.commonNames.size,
            totalCompoundSurnames: this.compoundSurnames.size,
            totalPinyinMappings: this.pinyinMapping.size,
            totalEnglishNames: this.englishNames.size,
            totalCompanyKeywords: this.companyKeywords.size,
            totalPositionKeywords: this.positionKeywords.size,
            totalDepartmentKeywords: this.departmentKeywords.size
        };
    }

    // === 調試和診斷方法 ===
    diagnoseText(text) {
        const diagnosis = {
            text: text,
            length: text.length,
            analysis: {
                hasNumbers: /\d/.test(text),
                hasChinese: /[\u4e00-\u9fa5]/.test(text),
                hasEnglish: /[A-Za-z]/.test(text),
                hasSymbols: /[@\-().]/.test(text)
            },
            semanticChecks: {
                isBusinessTerm: this.isBusinessTerm(text),
                isLocationTerm: this.isLocationTerm(text),
                isTechnicalTerm: this.isTechnicalTerm(text),
                isContactTerm: this.isContactTerm(text),
                isSemanticExclusion: this.isSemanticExclusion(text)
            },
            scores: {},
            recommendations: []
        };

        // 如果是中文，進行姓名分析
        if (diagnosis.analysis.hasChinese && text.length >= 2 && text.length <= 4) {
            const nameValidation = this.validateChineseName(text);
            diagnosis.scores.nameValidation = nameValidation;
            
            if (!nameValidation.valid) {
                diagnosis.recommendations.push(`姓名驗證失敗: ${nameValidation.reason}`);
            }
        }

        // 公司分析
        const companyScore = this.calculateCompanyScore(text);
        diagnosis.scores.companyScore = companyScore;
        if (companyScore >= 60) {
            diagnosis.recommendations.push(`可能是公司名稱 (${companyScore}分)`);
        }

        // 拼音分析 (如果有英文)
        if (diagnosis.analysis.hasEnglish) {
            const pinyinMatches = this.findChineseByPinyin(text);
            if (pinyinMatches.length > 0) {
                diagnosis.scores.pinyinMatches = pinyinMatches;
                diagnosis.recommendations.push(`發現拼音匹配: ${pinyinMatches[0].reason}`);
            }
        }

        return diagnosis;
    }

    // === 批次處理方法 ===
    batchAnalyzeTexts(texts) {
        const results = [];
        
        console.log(`🔍 批次分析 ${texts.length} 個文字片段...`);
        
        texts.forEach((text, index) => {
            const analysis = this.diagnoseText(text);
            results.push({
                index: index,
                originalText: text,
                analysis: analysis,
                category: this.categorizeText(analysis)
            });
        });

        return results;
    }

    categorizeText(analysis) {
        const text = analysis.text;
        
        // 基於分析結果進行分類
        if (analysis.semanticChecks.isContactTerm || /@/.test(text) || /\d{3,}/.test(text)) {
            return 'contact';
        }
        
        if (analysis.scores.companyScore && analysis.scores.companyScore >= 60) {
            return 'company';
        }
        
        if (analysis.scores.nameValidation && analysis.scores.nameValidation.valid) {
            return 'name';
        }
        
        if (analysis.semanticChecks.isBusinessTerm) {
            return 'business';
        }
        
        if (analysis.semanticChecks.isLocationTerm) {
            return 'address';
        }
        
        if (analysis.semanticChecks.isTechnicalTerm) {
            return 'technical';
        }
        
        return 'unknown';
    }

    // === 自我優化方法 ===
    learnFromFeedback(text, expectedCategory, actualCategory) {
        // 這個方法可以用來收集反饋，未來用於改進演算法
        console.log(`📝 學習反饋: "${text}" 預期:${expectedCategory} 實際:${actualCategory}`);
        
        // 未來可以在這裡實現機器學習邏輯
        // 例如調整權重、新增規則等
    }

    // === 效能優化方法 ===
    precompilePatterns() {
        // 預編譯常用的正則表達式以提高效能
        this.compiledPatterns = {
            chineseName: /^[\u4e00-\u9fa5]{2,4}$/,
            englishName: /^[A-Z][a-z]+ [A-Z][a-z]+$/,
            phone: /09\d{8}|0\d{1,2}[\-–—]\d{3,4}[\-–—]\d{4}/,
            email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/,
            url: /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}/
        };
        
        console.log('✅ 正則表達式預編譯完成');
    }

    // === 版本控制和更新 ===
    getVersion() {
        return {
            version: '2.0.0',
            lastUpdate: '2025-01-16',
            features: [
                '語義識別框架',
                '動態置信度計算',
                '增強拼音匹配',
                '批次分析功能',
                '自我診斷能力'
            ]
        };
    }
}

module.exports = NameDatabase;