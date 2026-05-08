// Cookie操作函数
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
    const cookieName = `${name}=`;
    const decodedCookie = decodeURIComponent(document.cookie);
    const cookieArray = decodedCookie.split(';');
    for (let i = 0; i < cookieArray.length; i++) {
        let cookie = cookieArray[i];
        while (cookie.charAt(0) === ' ') {
            cookie = cookie.substring(1);
        }
        if (cookie.indexOf(cookieName) === 0) {
            return cookie.substring(cookieName.length, cookie.length);
        }
    }
    return null;
}

// 加载设置
function loadSettings() {
    const settingsCookie = getCookie('appSettings');
    return JSON.parse(settingsCookie || '{}');
}

async function getVideoComments(bvid) {
    try {
        console.log(`Fetching comments for ${bvid}...`);
        const settings = loadSettings();
        const totalPages = settings.commentPages || 2;
        const commentUrl = `https://yutangxiaowu.cn:6008/api/comment/all?bvid=${encodeURIComponent(bvid)}&totalPages=${totalPages}`;
                    const response = await authFetch(commentUrl, {
                        method: 'GET',
                        timeout: 10000
                    });

        if (!response.ok) {
            throw new Error(`获取评论失败: ${response.status}`);
        }

        const data = await response.json();

        let commentsList = [];
        if (data && data.data && Array.isArray(data.data.comments)) {
            commentsList = data.data.comments;
        } else if (data && Array.isArray(data.data)) {
            commentsList = data.data; 
        }

        
        const processedComments = commentsList.map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
                return item.message || item.content || item.text || JSON.stringify(item);
            }
            return String(item);
        });

        console.log(`Fetched ${processedComments.length} comments for ${bvid}`);

        return {
            total: (data.data && data.data.total) || processedComments.length,
            pages: (data.data && data.data.pages) || 1,
            comments: processedComments
        };
    } catch (error) {
        console.error(`获取${bvid}评论失败:`, error);
        return { total: 0, pages: 0, comments: [] }; // 返回空评论数据
    }
}

let wordCloudInstance = null;

function initWordCloud() {
    const container = document.getElementById('wordcloud-container');
    
    if (container && (container.offsetWidth === 0 || container.offsetHeight === 0)) {
        console.warn('WordCloud container has no dimensions. Modal might be hidden.');
    }

    if (container) {
        if (typeof WordCloud === 'undefined') {
            console.error('WordCloud library not loaded');
            return;
        }
        
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 600;

        if (!wordCloudInstance) {
            wordCloudInstance = new WordCloud(container, {
                width: width,
                height: height,
                backgroundColor: '#f5f5f5'
            });
        } else {
            wordCloudInstance.options.width = width;
            wordCloudInstance.options.height = height;
        }
    }
}

function showWordCloudModal(bvid, title) {
    const modal = document.getElementById('wordcloud-modal');
    const titleEl = document.getElementById('wordcloud-title');
    if (titleEl) titleEl.textContent = `${title} - 评论词云`;
    
    if (modal) {
        modal.style.display = 'block';
        modal.offsetHeight; 
    }
    
    generateWordCloud(bvid);
}

function hideWordCloudModal() {
    const modal = document.getElementById('wordcloud-modal');
    if (modal) modal.style.display = 'none';
}

async function generateWordCloud(bvid) {
    const videoItem = window.allResults ? window.allResults.find(item => item && item.bvid === bvid) : null;
    
    if (!videoItem) {
        console.error('未找到视频数据');
        alert('未找到视频数据');
        return;
    }
    
    let comments = videoItem.comments?.comments || [];
    
    // 如果没有评论数据，尝试获取
    if (comments.length === 0) {
        const modal = document.getElementById('wordcloud-modal');
        const originalText = document.getElementById('wordcloud-title').textContent;
        document.getElementById('wordcloud-title').textContent += ' (正在获取数据...)';
        
        const commentData = await getVideoComments(bvid);
        comments = commentData.comments || [];
        if (videoItem) {
            videoItem.comments = commentData;
        }
        
        document.getElementById('wordcloud-title').textContent = originalText;
    }
    
    if (comments.length === 0) {
        alert('该视频没有评论数据');
        return;
    }
    
    const stringComments = comments.map(c => typeof c === 'object' ? (c.message || JSON.stringify(c)) : String(c));

    initWordCloud();
    
    if (wordCloudInstance) {
        console.log(`Generating word cloud with ${stringComments.length} comments`);
        wordCloudInstance.generate(stringComments);
    }
}

function saveWordCloudImage() {
    if (wordCloudInstance) {
        wordCloudInstance.saveAsImage();
    }
}

async function generateOverallWordCloud() {
    if (!window.allResults) {
        alert('没有视频数据');
        return;
    }

    const biliVideosWithComments = window.allResults.filter(item => 
        item && 
        (item.platform === 'bilibili' || !item.platform) && 
        item.comments && 
        item.comments.comments && 
        item.comments.comments.length > 0
    );
    
    if (biliVideosWithComments.length === 0) {
        alert('没有找到带有评论数据的B站视频。请先对单个视频点击“词云”以获取评论数据，或确保搜索结果包含评论。');
        return;
    }
    
    const allComments = [];
    biliVideosWithComments.forEach(video => {
        const videoComments = video.comments.comments;
        const stringComments = videoComments.map(c => typeof c === 'object' ? (c.message || JSON.stringify(c)) : String(c));
        allComments.push(...stringComments);
    });
    
    if (allComments.length === 0) {
        alert('没有可用的评论数据');
        return;
    }
    
    const modal = document.getElementById('wordcloud-modal');
    const titleEl = document.getElementById('wordcloud-title');
    if (titleEl) titleEl.textContent = '整体评论词云 - 包含 ' + biliVideosWithComments.length + ' 个视频';
    if (modal) {
        modal.style.display = 'block';
        modal.offsetHeight; 
    }

    initWordCloud();
    
    if (wordCloudInstance) {
        console.log(`Generating overall word cloud with ${allComments.length} comments`);
        wordCloudInstance.generate(allComments);
    }
}

function addWordCloudEventListeners() {
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('wordcloud-btn')) {
            const bvid = e.target.getAttribute('data-bvid');
            let title = bvid;
            const videoItem = window.allResults ? window.allResults.find(item => item && item.bvid === bvid) : null;
            if (videoItem && videoItem.title) {
                title = videoItem.title;
            }
            
            showWordCloudModal(bvid, title);
        }
        else if (e.target.id === 'generate-overall-wordcloud') {
            generateOverallWordCloud();
        }
    });
    
    const closeBtns = document.querySelectorAll('#wordcloud-modal .close, #close-wordcloud-btn');
    closeBtns.forEach(btn => {
        btn.addEventListener('click', hideWordCloudModal);
    });
    
    const saveBtn = document.getElementById('save-wordcloud-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveWordCloudImage);
    }
    
    window.addEventListener('click', function(e) {
        const modal = document.getElementById('wordcloud-modal');
        if (e.target === modal) {
            hideWordCloudModal();
        }
    });
}

if (document.readyState === 'loading') {
    window.addEventListener('load', addWordCloudEventListeners);
} else {
    addWordCloudEventListeners();
}
