class WordCloud {
    constructor(container, options = {}) {
        this.container = container;
        this.canvas = null;
        this.ctx = null;
        this.words = [];
        this.usedRects = [];
        
        this.options = {
            width: container.clientWidth || 800,
            height: container.clientHeight || 600,
            minFontSize: 12,
            maxFontSize: 60,
            padding: 5,
            rotateRatio: 0.3,
            backgroundColor: '#ffffff',
            ...options
        };
        
        this.init();
    }
    
    init() {
        // 创建Canvas元素
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.options.width;
        this.canvas.height = this.options.height;
        this.canvas.style.border = '1px solid #ccc';
        this.container.innerHTML = '';
        this.container.appendChild(this.canvas);
        
        this.ctx = this.canvas.getContext('2d');
        
        // 设置Canvas背景
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.options.width, this.options.height);
    }
    
    // 简单的中文分词函数
    tokenize(text) {
        // 移除标点符号和特殊字符
        const cleanedText = text.replace(/[\s\p{P}]/gu, '');
        
        // 简单的双字和单字分词
        const tokens = [];
        for (let i = 0; i < cleanedText.length; i++) {
            // 双字分词
            if (i < cleanedText.length - 1) {
                const twoChar = cleanedText.slice(i, i + 2);
                tokens.push(twoChar);
            }
            
            // 单字分词
            const singleChar = cleanedText.slice(i, i + 1);
            if (/[\u4e00-\u9fa5]/.test(singleChar)) {
                tokens.push(singleChar);
            }
        }
        
        return tokens;
    }
    
    // 统计词频
    countWordFrequency(tokens) {
        const frequency = new Map();
        
        tokens.forEach(token => {
            if (frequency.has(token)) {
                frequency.set(token, frequency.get(token) + 1);
            } else {
                frequency.set(token, 1);
            }
        });
        
        // 转换为数组并按词频排序
        return Array.from(frequency.entries())
            .map(([word, count]) => ({ word, count }))
            .sort((a, b) => b.count - a.count);
    }
    
    // 计算字体大小
    calculateFontSize(count, minCount, maxCount) {
        const ratio = (count - minCount) / (maxCount - minCount);
        return this.options.minFontSize + ratio * (this.options.maxFontSize - this.options.minFontSize);
    }
    
    // 检查单词是否与已放置的单词重叠
    isOverlapping(wordRect) {
        return this.usedRects.some(rect => {
            return !(wordRect.right < rect.left || 
                     wordRect.left > rect.right || 
                     wordRect.bottom < rect.top || 
                     wordRect.top > rect.bottom);
        });
    }
    
    // 获取随机颜色
    getRandomColor() {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
            '#F8B739', '#52B788', '#74C0FC', '#F06595', '#6366F1'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    // 绘制单词
    drawWord(word, x, y, fontSize, rotation = 0) {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(rotation);
        this.ctx.fillStyle = this.getRandomColor();
        this.ctx.font = `${fontSize}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(word, 0, 0);
        this.ctx.restore();
    }
    
    // 获取单词的边界矩形
    getWordBounds(word, fontSize, rotation = 0) {
        this.ctx.font = `${fontSize}px sans-serif`;
        const metrics = this.ctx.measureText(word);
        const width = metrics.width + this.options.padding * 2;
        const height = fontSize + this.options.padding * 2;
        
        // 考虑旋转后的边界
        if (rotation !== 0) {
            const cos = Math.abs(Math.cos(rotation));
            const sin = Math.abs(Math.sin(rotation));
            return {
                width: width * cos + height * sin,
                height: width * sin + height * cos
            };
        }
        
        return { width, height };
    }
    
    // 放置单词
    placeWord(wordObj, attempts = 100) {
        const { word, count, fontSize } = wordObj;
        let placed = false;
        let x, y, rotation, wordRect;
        
        for (let i = 0; i < attempts; i++) {
            // 随机位置（偏向中心）
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * Math.min(this.options.width, this.options.height) / 4;
            x = this.options.width / 2 + Math.cos(angle) * radius;
            y = this.options.height / 2 + Math.sin(angle) * radius;
            
            // 随机旋转
            rotation = Math.random() < this.options.rotateRatio ? 
                (Math.random() - 0.5) * Math.PI / 3 : 0;
            
            const bounds = this.getWordBounds(word, fontSize, rotation);
            wordRect = {
                left: x - bounds.width / 2,
                top: y - bounds.height / 2,
                right: x + bounds.width / 2,
                bottom: y + bounds.height / 2
            };
            
            // 检查是否超出画布或重叠
            if (wordRect.left > 0 && 
                wordRect.right < this.options.width && 
                wordRect.top > 0 && 
                wordRect.bottom < this.options.height && 
                !this.isOverlapping(wordRect)) {
                
                this.usedRects.push(wordRect);
                this.drawWord(word, x, y, fontSize, rotation);
                placed = true;
                break;
            }
        }
        
        return placed;
    }
    
    // 生成词云
    generate(textArray) {
        // 初始化画布
        this.init();
        
        // 合并所有文本
        const allText = textArray.join(' ');
        
        // 分词
        const tokens = this.tokenize(allText);
        
        // 统计词频
        const wordFrequencies = this.countWordFrequency(tokens);
        
        if (wordFrequencies.length === 0) {
            console.warn('No words to display in word cloud');
            return;
        }
        
        // 计算最小和最大词频
        const counts = wordFrequencies.map(w => w.count);
        const minCount = Math.min(...counts);
        const maxCount = Math.max(...counts);
        
        // 准备单词对象
        this.words = wordFrequencies.map(wordObj => ({
            ...wordObj,
            fontSize: this.calculateFontSize(wordObj.count, minCount, maxCount)
        }));
        
        // 清空已使用的矩形
        this.usedRects = [];
        
        // 放置单词
        this.words.forEach(wordObj => {
            this.placeWord(wordObj);
        });
    }
    
    // 清空词云
    clear() {
        this.init();
        this.words = [];
        this.usedRects = [];
    }
    
    // 保存词云为图片
    saveAsImage() {
        const link = document.createElement('a');
        link.download = 'wordcloud.png';
        link.href = this.canvas.toDataURL();
        link.click();
    }
}
