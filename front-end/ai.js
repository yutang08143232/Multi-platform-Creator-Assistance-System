// AI分析功能
document.addEventListener('click', function (e) {
    if (e.target.id === 'ai-analysis-button') {
        handleAIAnalysis();
    }
});

// 处理AI分析
async function handleAIAnalysis() {
    let currentData = window.allResults.length > 0 ? window.allResults : window.recentResults;

    if (!currentData || currentData.length === 0) {
        alert('请先解析视频数据再进行AI分析');
        return;
    }

    // 检查平台筛选器
    const platformFilter = document.getElementById('platform-filter');
    if (platformFilter && platformFilter.value) {
        const selectedPlatform = platformFilter.value;
        if (selectedPlatform !== 'all') {
            currentData = currentData.filter(item => item.platform === selectedPlatform);
            if (currentData.length === 0) {
                alert(`没有${getPlatformName(selectedPlatform)}视频数据`);
                return;
            }
        }
    }

    // 获取平台名称的辅助函数
    function getPlatformName(platform) {
        const platformNames = {
            'bilibili': 'B站',
            'douyin': '抖音',
            'kuaishou': '快手',
            'xiaohongshu': '小红书'
        };
        return platformNames[platform] || platform;
    }

    // 生成平台特定的AI提示
    function generatePlatformSpecificPrompt(videos) {
        // 检测数据中的平台
        const platforms = [...new Set(videos.map(v => v.platform))];
        const platformCount = platforms.length;
        
        if (platformCount === 1) {
            // 单一平台分析
            const platform = platforms[0];
            const platformName = getPlatformName(platform);
            
            switch (platform) {
                case 'bilibili':
                    return `你是一个专业的B站视频数据分析师。请根据提供的B站视频数据进行深度分析，包括：
1. 数据概况总结：播放量、弹幕数、评论数、收藏数、硬币数、分享数、点赞数的整体表现
2. 表现最佳的视频及其特点：分析数据表现最好的视频，包括其内容特点和互动模式
3. 各维度数据的深度分析：重点关注B站特色指标如弹幕密度、硬币转化率、收藏率等
4. 改进建议和洞察：基于B站用户群体和内容生态，提供针对性的内容优化建议
5. 评论区分析：如果有评论数据，分析用户反馈的主要趋势和热点话题

请用中文回复，结构清晰，分析专业，重点突出B站平台的独特性。`;
                
                case 'douyin':
                    return `你是一个专业的抖音视频数据分析师。请根据提供的抖音视频数据进行深度分析，包括：
1. 数据概况总结：播放量、点赞数、收藏数、分享数、评论数、推荐数的整体表现
2. 表现最佳的视频及其特点：分析数据表现最好的视频，包括其内容特点和互动模式
3. 各维度数据的深度分析：重点关注抖音特色指标如推荐数、点赞率、完播率等
4. 改进建议和洞察：基于抖音算法和用户群体，提供针对性的内容优化建议
5. 内容趋势分析：分析视频内容类型和风格的表现差异

请用中文回复，结构清晰，分析专业，重点突出抖音平台的独特性。`;
                
                case 'kuaishou':
                    return `你是一个专业的快手视频数据分析师。请根据提供的快手视频数据进行深度分析，包括：
1. 数据概况总结：播放量、点赞数、分享数、评论数的整体表现
2. 表现最佳的视频及其特点：分析数据表现最好的视频，包括其内容特点和互动模式
3. 各维度数据的深度分析：重点关注快手特色指标如播放完成率、互动率等
4. 改进建议和洞察：基于快手用户群体和内容生态，提供针对性的内容优化建议
5. 内容风格分析：分析视频风格和表现形式的效果差异

请用中文回复，结构清晰，分析专业，重点突出快手平台的独特性。`;
                
                case 'xiaohongshu':
                    return `你是一个专业的小红书视频数据分析师。请根据提供的小红书视频数据进行深度分析，包括：
1. 数据概况总结：点赞数、收藏数、分享数、评论数的整体表现
2. 表现最佳的视频及其特点：分析数据表现最好的视频，包括其内容特点和互动模式
3. 各维度数据的深度分析：重点关注小红书特色指标如收藏率、互动率等
4. 改进建议和洞察：基于小红书用户群体和内容生态，提供针对性的内容优化建议
5. 内容质量分析：分析视频的内容质量、视觉呈现和信息价值

请用中文回复，结构清晰，分析专业，重点突出小红书平台的独特性。`;
                
                default:
                    return `你是一个专业的视频数据分析师。请根据提供的视频数据进行分析，包括：
1. 数据概况总结
2. 表现最佳的视频及其特点
3. 各维度数据的分析
4. 改进建议和洞察
5. 内容趋势分析

请用中文回复，结构清晰，分析专业。`;
            }
        } else {
            // 跨平台分析
            return `你是一个专业的跨平台视频数据分析师。请根据提供的多平台视频数据进行综合分析，包括：
1. 数据概况总结：各平台视频的整体表现
2. 平台对比分析：对比不同平台在互动模式和内容表现上的差异
3. 表现最佳的视频及其特点：分析各平台表现最好的视频
4. 跨平台洞察：基于多平台数据，提供综合性的内容优化建议
5. 平台特性分析：针对每个平台的独特性，提供针对性的运营策略

请用中文回复，结构清晰，分析专业，重点突出各平台的特性差异。`;
        }
    }

    // 显示加载状态
    const resultArea = document.getElementById('ai-analysis-result');
    resultArea.innerHTML = `
        <div class="loading" style="text-align: center; padding: 2rem;">
            <p>🤖 AI正在分析视频数据，请稍候...</p>
        </div>
    `;
    resultArea.style.display = 'block';

    try {
        // 准备发送给AI的数据
        const analysisData = prepareDataForAI(currentData);
        const person_prompt = document.getElementById('ai-prompt') ? document.getElementById('ai-prompt').value.trim() : '';

        const response = await fetch('https://api.yutangxiaowu.cn/api/4c/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: person_prompt || generatePlatformSpecificPrompt(currentData)
                    },
                    {
                        role: "user",
                        content: `请分析以下视频数据：\n${JSON.stringify(analysisData, null, 2)}`
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`AI分析请求失败: ${response.status}`);
        }

        // 检查是否为流式响应
        if (!response.body) {
            throw new Error('服务器不支持流式响应');
        }

        // 初始化流式处理
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        // 替换加载状态为结果容器
        resultArea.innerHTML = `
<div class="recommendation-report">
    <h3 style="margin-top: 0; color: #23ade5;">🤖 AI智能分析报告</h3>
    <div id="stream-content" style="background: white; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #23ade5;">
    </div>
    <button id="close-analysis" class="export-button" style="margin-top: 1rem; background-color: #666;">
        关闭分析
    </button>
</div>
`;

        const contentContainer = document.getElementById('stream-content');

        // 防抖函数，减少DOM操作频率
        let updateTimeout = null;
        const debouncedUpdate = () => {
            if (updateTimeout) clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                if (contentContainer) {
                    contentContainer.innerHTML = formatAIAnalysisResult(fullContent);
                }
            }, 35); // 100ms防抖，平衡实时性和性能
        };

        // 逐段读取并显示内容
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;

            // 解码当前片段
            const chunkText = decoder.decode(value, { stream: true });

            // 处理SSE格式的响应（data: ... 格式）
            const lines = chunkText.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6); // 去掉前缀 "data: "

                    // 跳过结束标记
                    if (jsonStr === '[DONE]')
                        continue;

                    try {
                        const chunk = JSON.parse(jsonStr);

                        // 提取内容并处理
                        if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                            const txt = chunk.choices[0].delta.content;
                            fullContent += txt;

                            // 使用防抖更新，减少DOM操作频率
                            debouncedUpdate();
                        }
                    } catch (e) {
                        console.warn('解析chunk失败:', e);
                    }
                }
            }
        }

        // 确保最后一次更新被执行
        if (updateTimeout) clearTimeout(updateTimeout);
        if (contentContainer) {
            contentContainer.innerHTML = formatAIAnalysisResult(fullContent);
        }

        // 添加关闭按钮事件
        document.getElementById('close-analysis').addEventListener('click', function () {
            resultArea.style.display = 'none';
        });

    } catch (error) {
        console.error('AI分析错误:', error);
        resultArea.innerHTML = `
<div class="error">
    <p>AI分析失败: ${error.message}</p>
    <button onclick="handleAIAnalysis()" class="export-button">重试</button>
</div>
`;
    }
}

// 准备AI分析数据
function prepareDataForAI(videos) {
    return videos.map(video => {
        // 过滤掉错误数据
        if (video.error) return null;

        // 平台类型（默认为B站）
        const platform = video.platform || 'bilibili';
        
        // 构建平台特定的统计数据
        let statistics = {};
        
        switch (platform) {
            case 'xiaohongshu':
                statistics = {
                    like: video.stat?.like || 0,
                    favorite: video.stat?.favorite || 0,
                    share: video.stat?.share || 0,
                    comment: video.stat?.comment || 0
                };
                break;
            case 'douyin':
                statistics = {
                    like: video.stat?.like || 0,
                    favorite: video.stat?.favorite || 0,
                    share: video.stat?.share || 0,
                    comment: video.stat?.comment || 0,
                    recommend: video.stat?.recommend || 0,
                    view: video.stat?.view || 0
                };
                break;
            case 'kuaishou':
                statistics = {
                    like: video.stat?.like || 0,
                    share: video.stat?.share || 0,
                    comment: video.stat?.comment || 0,
                    view: video.stat?.view || 0
                };
                break;
            case 'bilibili':
            default:
                statistics = {
                    view: video.stat?.view || 0,
                    danmaku: video.stat?.danmaku || 0,
                    reply: video.stat?.reply || 0,
                    favorite: video.stat?.favorite || 0,
                    coin: video.stat?.coin || 0,
                    share: video.stat?.share || 0,
                    like: video.stat?.like || 0
                };
        }

        return {
            bvid: video.bvid || video.id || video.vid,
            title: video.title,
            author: video.author || video.owner_name,
            platform: platform,
            statistics: statistics,
            comments: {
                total: video.comments?.total || 0,
                sample: video.comments?.comments?.slice(0, 40) || []
            },
            totalScore: video.totalScore || null
        };
    }).filter(video => video !== null); // 过滤掉null值
}

// 格式化AI分析结果（将文本转换为HTML）
function formatAIAnalysisResult(text) {
    // 将换行符转换为HTML段落
    const paragraphs = text.split('\n\n').filter(p => p.trim());

    return paragraphs.map(paragraph => {
        // 处理表格
        if (isTable(paragraph)) {
            return formatTable(paragraph);
        }
        // 处理Markdown标题 (#, ##, ###, ####)
        else if (paragraph.startsWith('# ')) {
            return `<h2 style="color: #23ade5; margin: 2rem 0 1rem 0;">${processMarkdown(paragraph.substring(2))}</h2>`;
        }
        else if (paragraph.startsWith('## ')) {
            return `<h3 style="color: #23ade5; margin: 1.8rem 0 0.8rem 0;">${processMarkdown(paragraph.substring(3))}</h3>`;
        }
        else if (paragraph.startsWith('### ')) {
            return `<h4 style="color: #23ade5; margin: 1.5rem 0 0.5rem 0;">${processMarkdown(paragraph.substring(4))}</h4>`;
        }
        else if (paragraph.startsWith('#### ')) {
            return `<h5 style="color: #23ade5; margin: 1.2rem 0 0.2rem 0;">${processMarkdown(paragraph.substring(4))}</h5>`;
        }
        // 兼容原有标题格式（中文数字、数字点号）
        else if (paragraph.match(/^[一二三四五六七八九十]、/) || paragraph.match(/^\d+\./)) {
            return `<h4 style="color: #23ade5; margin: 1.5rem 0 0.5rem 0;">${processMarkdown(paragraph)}</h4>`;
        }
        // 处理Markdown列表项 (-、*、•)
        else if (paragraph.match(/^[-*•]\s/)) {
            // 处理多行列表
            const listItems = paragraph.split('\n').filter(item => item.match(/^[-*•]\s/));
            if (listItems.length > 1) {
                let listHtml = '<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">';
                listItems.forEach(item => {
                    const content = item.replace(/^[-*•]\s/, '').trim();
                    listHtml += `<li>${processMarkdown(content)}</li>`;
                });
                listHtml += '</ul>';
                return listHtml;
            } else {
                const content = paragraph.replace(/^[-*•]\s/, '').trim();
                return `<ul style="margin: 0.5rem 0; padding-left: 1.5rem;"><li>${processMarkdown(content)}</li></ul>`;
            }
        }
        // 处理有序列表 (1.、2.)
        else if (paragraph.match(/^\d+\.\s/)) {
            const listItems = paragraph.split('\n').filter(item => item.match(/^\d+\.\s/));
            if (listItems.length > 1) {
                let listHtml = '<ol style="margin: 0.5rem 0; padding-left: 1.8rem;">';
                listItems.forEach(item => {
                    const content = item.replace(/^\d+\.\s/, '').trim();
                    listHtml += `<li>${processMarkdown(content)}</li>`;
                });
                listHtml += '</ol>';
                return listHtml;
            } else {
                const content = paragraph.replace(/^\d+\.\s/, '').trim();
                return `<ol style="margin: 0.5rem 0; padding-left: 1.8rem;"><li>${processMarkdown(content)}</li></ol>`;
            }
        }
        // 普通段落
        else {
            return `<p style="margin: 0.8rem 0; line-height: 1.6;">${processMarkdown(paragraph)}</p>`;
        }
    }).join('');
}

// 处理Markdown内联格式（**粗体**、*斜体*等）
function processMarkdown(text) {
    // 处理粗体 **text**
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 处理斜体 *text*
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // 处理链接 [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    return text;
}

// 检测并处理表格
function isTable(text) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return false;
    
    // 检查表头分隔线（允许空格）
    return lines.some(line => line.trim().match(/^[\|\s:=-]+$/));
}

// 解析并格式化表格
function formatTable(text) {
    let lines = text.split('\n').filter(line => line.trim() !== '');
    
    // 处理单行表格情况
    if (lines.length === 1 && text.includes('| :--- |')) {
        const singleLine = lines[0];
        // 分割表头、分隔线和数据行
        const parts = singleLine.split('| :--- |');
        if (parts.length >= 2) {
            // 提取表头
            const headerPart = parts[0] + '|';
            const dataPart = '|' + parts[1];
            
            // 重新构建表格行
            lines = [headerPart, '| :--- |', dataPart];
        }
    }
    
    if (lines.length < 2) return text;
    
    let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 1rem 0;">';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 跳过分隔线
        if (line.match(/^[\|\s:=-]+$/)) continue;
        
        const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell !== '');
        
        if (i === 0) {
            // 表头
            tableHtml += '<thead><tr>';
            cells.forEach(cell => {
                tableHtml += `<th style="border: 1px solid #e0e0e0; padding: 0.8rem; text-align: left; background-color: #f5f5f5;">${processMarkdown(cell)}</th>`;
            });
            tableHtml += '</tr></thead><tbody>';
        } else {
            // 表格内容
            tableHtml += '<tr>';
            cells.forEach(cell => {
                tableHtml += `<td style="border: 1px solid #e0e0e0; padding: 0.8rem; text-align: left;">${processMarkdown(cell)}</td>`;
            });
            tableHtml += '</tr>';
        }
    }
    
    tableHtml += '</tbody></table>';
    return tableHtml;
}