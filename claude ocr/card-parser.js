// card-parser.js - V3.0 (最終・功能完整・電話優化版)
const config = require('./config');
const NameDatabase = require('./name-database');

class CardParser {
    constructor() {
        this.result = {};
        this.context = {};
        this.nameDatabase = new NameDatabase();
        this.resetResult();
    }

    parse(text, detections) {
        console.log('🧠 啟動通用語義識別引擎 (V3.0 最終版)...');
        
        this.resetResult();
        this.result.rawText = text;

        // 【流程優化】步驟一：優先提取格式明確的聯絡資訊
        this.extractAllContactInfo();
        
        // 步驟二：用剩餘的文本進行上下文建立與分析
        this.buildContext(this.context.remainingText, detections);
        this.detectLayoutAndCollectChars();
        this.performSemanticAnalysis();
        this.classifyCandidates();
        this.selectBestCandidates();
        this.calculateOverallConfidence();
        
        console.log(`✅ 語義識別完成，綜合信心度: ${this.result.confidence}%`);
        return this.result;
    }

    resetResult() {
        this.result = {
            name: '', company: '', position: '', phone: '', mobile: '',
            fax: '', email: '', website: '', address: '', department: '',
            rawText: '', confidence: 0
        };
        this.context = {
            lines: [],
            detections: [],
            semanticBlocks: [],
            layout: 'horizontal',
            singleCharBlocks: [],
            remainingText: '', // 新增：用於儲存處理完聯絡資訊後剩餘的文本
            candidates: {
                names: [],
                companies: [],
                positions: [],
            }
        };
    }

    // 【優化注入】使用全新、更強大的聯絡資訊提取模組
    extractAllContactInfo() {
        let text = this.result.rawText;
        
        const cleanAndExtract = (patterns, field) => {
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match && !this.result[field]) {
                    const found = match[0].replace(/^(tel|mobile|fax|m|t|f)[:：\s]*/i, '').trim();
                    this.result[field] = found;
                    console.log(`  ✓ ${field.charAt(0).toUpperCase() + field.slice(1)}: ${found}`);
                    text = text.replace(match[0], ''); // 從原文中移除已找到的號碼
                    return;
                }
            }
        };

        const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const emailMatch = text.match(emailPattern);
        if (emailMatch) {
            this.result.email = emailMatch[0];
            text = text.replace(emailMatch[0], '');
            console.log(`  ✓ Email: ${this.result.email}`);
        }

        const websitePattern = /(?:https?:\/\/)?(?:www\.)?[\w-]+\.[\w.-]+/;
        const websiteMatch = text.match(websitePattern);
        if (websiteMatch && !websiteMatch[0].includes('@')) {
            this.result.website = websiteMatch[0];
            text = text.replace(websiteMatch[0], '');
            console.log(`  ✓ Website: ${this.result.website}`);
        }

        const mobilePatterns = [
            /(?:\+886|886)[\s-]?9\d{2}[\s-]?\d{3}[\s-]?\d{3}/g,
            /09\d{2}[\s-]?\d{3}[\s-]?\d{3}/g,
            /09\d{8}/g,
            /\(09\d{2}\)\d{6}/g,
            /(?:mobile|m)[:：\s]*09\d{2}[\s-]?\d{6}/gi
        ];

        const landlinePatterns = [
            /\(0\d{1,3}\)[\s-]?\d{3,4}[\s-]?\d{4}(?:\s*(?:ext|分機|轉|#)[:：\s]*\d+)?/gi,
            /0\d{1,3}[\s-]\d{3,4}[\s-]\d{4}/g,
            /(?:\+886|886)[\s-]?\d{1,3}[\s-]?\d{3,4}[\s-]?\d{4}/g,
            /0[2-8]\d{8}/g,
            /(?:tel|t|電話)[:：\s]*\(?0\d{1,3}\)?[\s-]?\d{3,4}[\s-]?\d{4}/gi
        ];
        
        const faxPatterns = [
            /(?:fax|f|傳真)[:：\s]*\(?0\d{1,3}\)?[\s-]?\d{3,4}[\s-]?\d{4}/gi
        ];

        cleanAndExtract(mobilePatterns, 'mobile');
        cleanAndExtract(landlinePatterns, 'phone');
        cleanAndExtract(faxPatterns, 'fax');
        
        this.context.remainingText = text;
    }

    // (以下完整保留您 800 行版本的所有精密邏輯)
    buildContext(text, detections) {
        this.context.lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        this.context.detections = detections || [];
        console.log(`📊 語義分析上下文: ${this.context.lines.length}行, ${this.context.detections.length}個檢測塊`);
    }

    detectLayoutAndCollectChars() {
        this.context.lines.forEach((line, index) => {
            const cleanLine = line.trim();
            if (/^[\u4e00-\u9fa5]$/.test(cleanLine)) {
                if (this.isValidNameChar(cleanLine)) {
                    this.context.singleCharBlocks.push({
                        text: cleanLine,
                        lineIndex: index,
                        isValidNameChar: true
                    });
                }
            }
        });
        
        if (this.context.singleCharBlocks.length >= 2) {
            this.context.layout = 'mixed_with_singles';
            console.log(`📐 檢測到包含單字符的佈局 (${this.context.singleCharBlocks.length}個單字符)`);
        } else {
            this.context.layout = 'horizontal';
            console.log(`📐 檢測到標準橫式佈局`);
        }
        
        this.context.semanticBlocks = this.buildSemanticBlocks();
    }

    buildSemanticBlocks() {
        const blocks = [];
        this.context.lines.forEach((line, index) => {
            const block = {
                text: line,
                lineIndex: index,
                length: line.length,
                hasNumbers: /\d/.test(line),
                hasChinese: /[\u4e00-\u9fa5]/.test(line),
                hasEnglish: /[A-Za-z]/.test(line),
                isSingleChar: /^[\u4e00-\u9fa5]$/.test(line.trim()),
                isValidNameChar: this.isValidNameChar(line.trim()),
                wordCount: line.split(/\s+/).filter(w => w.length > 0).length,
                semanticHints: []
            };
            this.addSemanticHints(block);
            blocks.push(block);
        });
        return blocks;
    }

    addSemanticHints(block) {
        const text = block.text;
        if (/(corporation|company|group|ltd|inc|公司|集團|企業|工業|科技)/i.test(text)) {
            block.semanticHints.push('company');
        }
        if (/(manager|director|engineer|總經理|經理|工程師|主任|部長|專員|課長)/i.test(text)) {
            block.semanticHints.push('position');
        }
        if (/(department|division|dept|部|課|科|組|室|中心)/i.test(text)) {
            block.semanticHints.push('department');
        }
        if (/(市|縣|區|鄉|鎮|路|街|號|樓|台中|台北|高雄|\d{3,6}[\s]*台)/i.test(text)) {
            block.semanticHints.push('address');
        }
        if (block.isSingleChar && block.isValidNameChar) {
            block.semanticHints.push('single_char_name');
        }
        if (block.hasChinese && text.length >= 2 && text.length <= 4 && !/\d/.test(text) && block.semanticHints.length === 0) {
            block.semanticHints.push('name_candidate');
        }
        if (block.hasEnglish && !block.hasChinese && block.wordCount >= 2 && block.wordCount <= 4 && !block.hasNumbers && block.semanticHints.length === 0) {
            block.semanticHints.push('name_candidate');
        }
    }

    performSemanticAnalysis() {
        console.log('🔍 執行語義分析...');
        if (this.context.layout === 'mixed_with_singles') {
            this.parseWithSingleCharReconstruction();
        } else {
            this.parseHorizontalLayout();
        }
    }

    parseWithSingleCharReconstruction() {
        console.log('🔧 執行智能單字符重組解析...');
        this.reconstructAllPossibleNames();
        this.context.semanticBlocks.forEach(block => {
            if (!block.isSingleChar) {
                this.analyzeBlock(block);
            }
        });
    }

    reconstructAllPossibleNames() {
        if (this.context.singleCharBlocks.length === 0) return;
        console.log(`  🔤 嘗試重組 ${this.context.singleCharBlocks.length} 個單字符...`);
        const allCombinations = this.generateNameCombinations();
        allCombinations.forEach(combination => {
            const reconstructedName = combination.chars.map(c => c.text).join('');
            const validation = this.nameDatabase.validateChineseName(reconstructedName);
            if (validation.valid) {
                let confidence = validation.confidence + this.calculatePositionBonus(combination) + this.calculateSurnameBonus(combination) + this.calculateContinuityBonus(combination);
                this.context.candidates.names.push({
                    text: reconstructedName,
                    confidence: confidence,
                    type: 'reconstructed',
                    source: `智能重組${combination.chars.length}字(行${combination.positions})`,
                    combination: combination
                });
                console.log(`    ✓ 重組候選: "${reconstructedName}" (${confidence}分)`);
            }
        });
    }

    generateNameCombinations() {
        const combinations = [];
        const chars = this.context.singleCharBlocks;
        chars.forEach((surnameChar, surnameIndex) => {
            if (this.nameDatabase.isSurname(surnameChar.text)) {
                for (let len = 2; len <= 4; len++) {
                    this.findNameCombinationsWithSurname(surnameChar, surnameIndex, len - 1, combinations);
                }
            }
        });
        if (combinations.length === 0) {
            this.generateAllPossibleCombinations(combinations);
        }
        return combinations;
    }

    findNameCombinationsWithSurname(surnameChar, surnameIndex, remainingLength, combinations) {
        const chars = this.context.singleCharBlocks;
        const findCombinations = (currentCombination, startIndex, remaining) => {
            if (remaining === 0) {
                combinations.push({
                    chars: currentCombination,
                    positions: currentCombination.map(c => c.lineIndex + 1).join(','),
                    hasSurname: true,
                    surnameFirst: currentCombination[0] === surnameChar
                });
                return;
            }
            for (let i = startIndex; i < chars.length; i++) {
                if (chars[i] !== surnameChar && !currentCombination.includes(chars[i])) {
                    findCombinations([...currentCombination, chars[i]], i + 1, remaining - 1);
                }
            }
        };
        findCombinations([surnameChar], 0, remainingLength);
    }

    generateAllPossibleCombinations(combinations) {
        const chars = this.context.singleCharBlocks;
        for (let len = 2; len <= Math.min(4, chars.length); len++) {
            this.generateCombinationsOfLength(chars, len, combinations);
        }
    }

    generateCombinationsOfLength(chars, length, combinations) {
        const generate = (start, currentCombination) => {
            if (currentCombination.length === length) {
                combinations.push({
                    chars: currentCombination,
                    positions: currentCombination.map(c => c.lineIndex + 1).join(','),
                    hasSurname: currentCombination.some(c => this.nameDatabase.isSurname(c.text)),
                    surnameFirst: this.nameDatabase.isSurname(currentCombination[0].text)
                });
                return;
            }
            for (let i = start; i < chars.length; i++) {
                generate(i + 1, [...currentCombination, chars[i]]);
            }
        };
        generate(0, []);
    }

    calculatePositionBonus(combination) {
        let bonus = 0;
        const avgPosition = combination.chars.reduce((sum, char) => sum + char.lineIndex, 0) / combination.chars.length;
        if (avgPosition <= 3) bonus += 15;
        else if (avgPosition <= 6) bonus += 10;
        else if (avgPosition <= 9) bonus += 5;
        return bonus;
    }

    calculateSurnameBonus(combination) {
        let bonus = 0;
        const firstChar = combination.chars[0];
        if (combination.surnameFirst) {
            if (this.nameDatabase.isCommonSurname(firstChar.text)) bonus += 20;
            else if (this.nameDatabase.isSurname(firstChar.text)) bonus += 15;
        }
        if (combination.hasSurname && !combination.surnameFirst) bonus += 8;
        return bonus;
    }

    calculateContinuityBonus(combination) {
        let bonus = 0;
        const positions = combination.chars.map(c => c.lineIndex).sort((a, b) => a - b);
        let continuousCount = 1;
        for (let i = 1; i < positions.length; i++) {
            if (positions[i] - positions[i-1] === 1) continuousCount++;
            else break;
        }
        if (continuousCount === positions.length) bonus += 25;
        else if (continuousCount >= positions.length / 2) bonus += 10;
        const maxGap = Math.max(...positions) - Math.min(...positions);
        if (maxGap > 8) bonus -= 10;
        return bonus;
    }

    parseHorizontalLayout() {
        console.log('📐 執行橫式佈局解析...');
        this.context.semanticBlocks.forEach(block => this.analyzeBlock(block));
    }

    analyzeBlock(block) {
        if (block.semanticHints.includes('name_candidate')) this.analyzeNameCandidate(block);
        if (block.semanticHints.includes('company')) this.analyzeCompanyCandidate(block);
        if (block.semanticHints.includes('position')) this.analyzePositionCandidate(block);
        if (block.semanticHints.includes('department')) this.analyzeDepartmentCandidate(block);
        if (block.semanticHints.includes('address')) this.analyzeAddressCandidate(block);
    }

    analyzeNameCandidate(block) {
        const text = block.text;
        if (block.hasChinese && /^[\u4e00-\u9fa5\s]{2,4}$/.test(text.replace(/\s/g, ''))) {
            const cleanName = text.replace(/\s/g, '');
            const validation = this.nameDatabase.validateChineseName(cleanName);
            if (validation.valid) {
                const confidence = validation.confidence + this.calculatePositionalBonus(block);
                this.context.candidates.names.push({
                    text: cleanName,
                    confidence: confidence,
                    type: 'chinese',
                    source: `中文姓名候選(行${block.lineIndex + 1})`,
                    block: block
                });
            }
        }
        if (block.hasEnglish && !block.hasChinese && block.wordCount >= 2 && block.wordCount <= 4) {
            const words = text.split(/\s+/).filter(w => w.length > 0);
            const isProperName = words.every(word => /^[A-Z][a-z]*$/.test(word));
            if (isProperName && !this.nameDatabase.isCompanyKeyword(text)) {
                const confidence = 70 + this.calculatePositionalBonus(block);
                this.context.candidates.names.push({
                    text: text,
                    confidence: confidence,
                    type: 'english',
                    source: `英文姓名候選(行${block.lineIndex + 1})`,
                    block: block
                });
            }
        }
    }

    analyzeCompanyCandidate(block) {
        const confidence = this.calculateCompanyConfidence(block.text, block);
        if (confidence >= 60) {
            this.context.candidates.companies.push({
                text: block.text,
                confidence: confidence,
                source: `公司候選(行${block.lineIndex + 1})`,
                block: block
            });
        }
    }

    analyzePositionCandidate(block) {
        const confidence = this.calculatePositionConfidence(block.text, block);
        if (confidence >= 50) {
            this.context.candidates.positions.push({
                text: block.text,
                confidence: confidence,
                source: `職位候選(行${block.lineIndex + 1})`,
                block: block
            });
        }
    }

    analyzeDepartmentCandidate(block) {
        if (this.isDepartmentPattern(block.text)) {
            this.result.department = block.text;
        }
    }

    analyzeAddressCandidate(block) {
        if (this.isAddressPattern(block.text) && block.text.length > 10) {
            if (!this.result.address || block.text.length > this.result.address.length) {
                this.result.address = block.text;
            }
        }
    }

    calculatePositionalBonus(block) {
        let bonus = 0;
        if (block.lineIndex <= 2) bonus += 15;
        else if (block.lineIndex <= 4) bonus += 10;
        if (block.length <= 6) bonus += 10;
        else if (block.length <= 10) bonus += 5;
        if (block.wordCount === 1 && block.hasChinese) bonus += 10;
        return bonus;
    }

    calculateCompanyConfidence(text, block) {
        let confidence = 40;
        const companyKeywords = [
            { words: ['corporation', 'company', 'group', 'ltd', 'inc'], score: 35 },
            { words: ['公司', '企業', '集團'], score: 35 },
            { words: ['科技', '工業', '技術'], score: 25 },
            { words: ['systems', 'solutions', 'technology'], score: 25 }
        ];
        for (let category of companyKeywords) {
            for (let keyword of category.words) {
                if (text.toLowerCase().includes(keyword.toLowerCase())) {
                    confidence += category.score;
                    break;
                }
            }
        }
        if (text.length >= 8 && text.length <= 50) confidence += 15;
        if (this.isObviouslyNotCompany(text)) confidence -= 30;
        return Math.min(confidence, 95);
    }

    calculatePositionConfidence(text, block) {
        let confidence = 30;
        const positionKeywords = [
            { words: ['manager', 'director', 'engineer', 'senior', 'chief'], score: 30 },
            { words: ['經理', '總監', '主任', '部長', '課長'], score: 30 },
            { words: ['工程師', '專員', '副理', '協理'], score: 25 },
            { words: ['助理', '秘書', '顧問'], score: 20 }
        ];
        for (let category of positionKeywords) {
            for (let keyword of category.words) {
                if (text.toLowerCase().includes(keyword.toLowerCase())) {
                    confidence += category.score;
                    break;
                }
            }
        }
        if (text.length >= 3 && text.length <= 20) confidence += 15;
        return confidence;
    }

    classifyCandidates() {
        console.log('🎯 候選者分類評估...');
        if (this.context.candidates.names.length > 0) {
            console.log(`  姓名候選: ${this.context.candidates.names.length}個`);
        }
        if (this.context.candidates.companies.length > 0) {
            console.log(`  公司候選: ${this.context.candidates.companies.length}個`);
        }
    }

    selectBestCandidates() {
        console.log('🔍 選擇最佳候選者...');
        this.enhanceWithEmailValidation();
        if (this.context.candidates.names.length > 0) {
            const bestName = this.context.candidates.names.sort((a, b) => b.confidence - a.confidence)[0];
            this.result.name = bestName.text;
            console.log(`  ✓ 最佳姓名: "${bestName.text}" (${bestName.confidence}分)`);
        }
        if (this.context.candidates.companies.length > 0) {
            const bestCompany = this.context.candidates.companies.sort((a, b) => b.confidence - a.confidence)[0];
            this.result.company = bestCompany.text;
            console.log(`  ✓ 最佳公司: "${bestCompany.text}" (${bestCompany.confidence}分)`);
        }
        if (this.context.candidates.positions.length > 0) {
            const bestPosition = this.context.candidates.positions.sort((a, b) => b.confidence - a.confidence)[0];
            this.result.position = bestPosition.text;
            console.log(`  ✓ 最佳職位: "${bestPosition.text}" (${bestPosition.confidence}分)`);
        }
    }

    enhanceWithEmailValidation() {
        if (!this.result.email) return;
        const emailPrefix = this.result.email.split('@')[0].toLowerCase();
        console.log(`  📧 使用Email前綴進行驗證: ${emailPrefix}`);
        this.context.candidates.names.forEach(candidate => {
            let bonusScore = 0;
            if (candidate.type === 'chinese' || candidate.type === 'reconstructed') {
                bonusScore = this.calculateChineseEmailMatch(candidate.text, emailPrefix);
            } else if (candidate.type === 'english') {
                bonusScore = this.calculateEnglishEmailMatch(candidate.text, emailPrefix);
            }
            if (bonusScore > 0) {
                candidate.confidence += bonusScore;
            }
        });
    }

    calculateChineseEmailMatch(chineseName, emailPrefix) {
        let maxScore = 0;
        for (let char of chineseName) {
            const pinyinMatches = this.nameDatabase.findChineseByPinyin(emailPrefix);
            for (let match of pinyinMatches) {
                if (match.chinese === char) {
                    maxScore = Math.max(maxScore, Math.min(30, match.confidence - 40));
                }
            }
        }
        const emailParts = emailPrefix.split(/[._-]/);
        if (emailParts.length >= 2) {
            let combinedScore = 0;
            emailParts.forEach(part => {
                if (part.length >= 3) {
                    const partMatches = this.nameDatabase.findChineseByPinyin(part);
                    for (let match of partMatches) {
                        if (chineseName.includes(match.chinese)) {
                            combinedScore += 15;
                        }
                    }
                }
            });
            maxScore = Math.max(maxScore, combinedScore);
        }
        return maxScore;
    }

    calculateEnglishEmailMatch(englishName, emailPrefix) {
        const nameParts = englishName.toLowerCase().split(' ');
        let maxScore = 0;
        for (let part of nameParts) {
            if (part.length >= 3 && emailPrefix.includes(part)) {
                maxScore = Math.max(maxScore, 20);
            }
        }
        const initials = nameParts.map(part => part.charAt(0)).join('');
        if (emailPrefix.includes(initials) && initials.length >= 2) {
            maxScore = Math.max(maxScore, 10);
        }
        return maxScore;
    }

    calculateOverallConfidence() {
        let totalScore = 0, maxScore = 0;
        const scoreWeights = { name: 30, company: 25, position: 15, phone: 10, mobile: 10, email: 15, website: 5, address: 10 };
        for (let [field, weight] of Object.entries(scoreWeights)) {
            maxScore += weight;
            if (this.result[field]) {
                if (field !== 'name' || this.result.name.length >= 2) totalScore += weight;
            }
        }
        if (this.result.name && this.result.company) totalScore += 10;
        if (this.result.email && this.result.name) totalScore += 5;
        maxScore += 15;
        this.result.confidence = Math.min(Math.round((totalScore / maxScore) * 100), 95);
    }

    isValidNameChar(char) {
        if (!/^[\u4e00-\u9fa5]$/.test(char)) return false;
        const excludeChars = ['部', '課', '科', '組', '室', '處', '廳', '局', '署', '營', '業', '務', '技', '術', '工', '程', '管', '理', '市', '縣', '區', '鄉', '鎮', '村', '里', '路', '街', '號', '樓', '層', '巷', '弄', '話', '機', '電', '傳', '真', '址', '件', '箱', '統', '編', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        return !excludeChars.includes(char);
    }

    isObviouslyNotCompany(text) {
        return /^\d+$|@|https?:\/\/|電話|傳真|手機|地址|^[A-Z]{1,3}$/.test(text);
    }

    isDepartmentPattern(text) {
        return /.*[部課科組室中心]$/.test(text) && text.length >= 3 && text.length <= 20 && !this.result.name?.includes(text) && !this.result.company?.includes(text);
    }

    isAddressPattern(text) {
        return /(\d{3,6}.*[市縣區鄉鎮].*[路街].*[號樓])|(\d{3,6}.*台.*市)|(\d{3,6}.*工業區)/.test(text);
    }
}

module.exports = CardParser;