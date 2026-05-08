// 混合平台AI分析功能
async function handleMixedAIAnalysisGlobal(allResults) {
    if (!allResults || allResults.length === 0) {
        alert('请先解析视频数据再进行AI分析');
        return;
    }

    // 显示加载状态
    const resultArea = document.getElementById('ai-analysis-mixed-result');
    
    // 如果找不到，尝试创建一个并插入到表格之前
    if (!resultArea) {
         console.warn('ai-analysis-mixed-result not found, creating one...');
         const newResultArea = document.createElement('div');
         newResultArea.id = 'ai-analysis-mixed-result';
         newResultArea.style.marginBottom = '1.5rem';
         newResultArea.innerHTML = `
             <div class="loading" style="text-align: center; padding: 2rem;">
                 <p>🤖 AI正在综合分析多平台视频数据，请稍候...</p>
             </div>
         `;
         newResultArea.style.display = 'block';
         
         // 尝试插入到sort-controls之前
         const sortControls = document.querySelector('.sort-controls');
         if (sortControls) {
             sortControls.parentNode.insertBefore(newResultArea, sortControls);
         } else {
             // 如果找不到sort-controls，插入到table-container之前
             const tableContainer = document.querySelector('.table-container');
             if (tableContainer) {
                 tableContainer.parentNode.insertBefore(newResultArea, tableContainer);
             } else {
                  console.error('Cannot find suitable place to insert result area');
                  alert('无法显示AI分析结果：页面结构异常');
                  return;
             }
         }
    } else {
        resultArea.innerHTML = `
            <div class="loading" style="text-align: center; padding: 2rem;">
                <p>🤖 AI正在综合分析多平台视频数据，请稍候...</p>
            </div>
        `;
        resultArea.style.display = 'block';
    }

    try {
        // 准备发送给AI的数据
        const analysisData = prepareMixedDataForAI(allResults);
        const person_prompt = document.getElementById('ai-prompt') ? document.getElementById('ai-prompt').value.trim() : '';
        
        // 统计平台分布
        const platformCounts = {
            bilibili: allResults.filter(v => v.platform === 'bilibili').length,
            douyin: allResults.filter(v => v.platform === 'douyin').length,
            kuaishou: allResults.filter(v => v.platform === 'kuaishou').length,
            xiaohongshu: allResults.filter(v => v.platform === 'xiaohongshu').length
        };
        
        const platformSummary = `包含 ${platformCounts.bilibili} 个B站视频，${platformCounts.douyin} 个抖音视频，${platformCounts.kuaishou} 个快手视频，${platformCounts.xiaohongshu} 个小红书视频`;

        const apiEndpoint = 'https://api.yutangxiaowu.cn/api/4c/chat';
        
        console.log(`Sending request to AI service at ${apiEndpoint}...`);
        
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: person_prompt || `你是一个专业的跨平台短视频数据分析师。请根据提供的多平台（B站、抖音、快手、小红书）视频数据进行综合分析。
请包含以下内容：
1. **跨平台数据概览**：总结各平台视频的整体表现和流量特征。
2. **最佳表现视频分析**：指出哪个平台或哪类内容的视频表现最好，并分析原因。
3. **平台差异化洞察**：对比不同平台（B站、抖音、快手、小红书）在互动模式（点赞、评论、收藏、分享等）上的差异。
4. **综合改进建议**：针对创作者提出跨平台运营或内容优化的具体建议。

请用中文回复，使用Markdown格式，结构清晰，重点突出，分析专业且有深度。
注意：小红书数据中可能没有播放量，请重点分析点赞、评论和分享数据。`
                    },
                    {
                        role: "user",
                        content: `请分析以下混合平台视频数据（${platformSummary}）：\n${JSON.stringify(analysisData, null, 2)}`
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
        if (resultArea) {
            resultArea.innerHTML = `
            <div class="recommendation-report">
                <h3 style="margin-top: 0; color: #23ade5;">🤖 AI混合平台智能分析报告</h3>
                <div id="mixed-stream-content" style="background: white; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #23ade5;">
                </div>
                <button id="close-mixed-analysis" class="export-button" style="margin-top: 1rem; background-color: #666;">
                    关闭分析
                </button>
            </div>
            `;
        }

        const contentContainer = document.getElementById('mixed-stream-content');

        // 防抖函数，减少DOM操作频率
        let updateTimeout = null;
        const debouncedUpdate = () => {
            if (updateTimeout) clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                if (contentContainer) {
                    contentContainer.innerHTML = formatMixedAIAnalysisResult(fullContent);
                }
            }, 35); // 100ms防抖，平衡实时性和性能
        };

        // 逐段读取并显示内容
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // 解码当前片段
            const chunkText = decoder.decode(value, { stream: true });

            // 处理SSE格式的响应（data: ... 格式）
            const lines = chunkText.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6); // 去掉前缀 "data: "

                    // 跳过结束标记
                    if (jsonStr === '[DONE]') continue;

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
            contentContainer.innerHTML = formatMixedAIAnalysisResult(fullContent);
        }

        // 添加关闭按钮事件
        const closeBtn = document.getElementById('close-mixed-analysis');
        if (closeBtn && resultArea) {
            closeBtn.addEventListener('click', function () {
                resultArea.style.display = 'none';
            });
        }

    } catch (error) {
        console.error('AI分析错误:', error);
        if (resultArea) {
            resultArea.innerHTML = `
            <div class="error">
                <p>AI分析失败: ${error.message}</p>
                <button id="retry-mixed-ai" class="export-button">重试</button>
            </div>
            `;
            
            const retryBtn = document.getElementById('retry-mixed-ai');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => handleMixedAIAnalysisGlobal(allResults));
            }
        }
    }
}

// 准备AI分析数据（混合平台适配版）
function prepareMixedDataForAI(videos) {
    if (!Array.isArray(videos)) return [];

    return videos.map(video => {
        // 检查video对象是否存在
        if (!video) return null;

        // 过滤掉错误数据
        if (video.error) return null;

        const cleanStat = {};
        // 仅保留有效数据，去除 '-'
        if (video.stat) {
            for (const key in video.stat) {
                if (video.stat[key] !== '-' && video.stat[key] !== undefined) {
                    cleanStat[key] = video.stat[key];
                }
            }
        }

        return {
            platform: video.platform, // 增加平台标识
            id: video.bvid || video.vid,
            title: video.title,
            author: video.author,
            statistics: cleanStat,
            finalScore: video.finalScore || null // 包含计算出的评分
        };
    }).filter(video => video !== null).slice(0, 20); // 限制最多分析20条，避免Token溢出
}

// 格式化AI分析结果（复用markdown处理逻辑，保持与单平台一致以避免页面抖动）
function formatMixedAIAnalysisResult(text) {
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
    // 处理单行表格情况
    if (text.includes('| :--- |')) {
        return true;
    }
    
    // 处理多行表格情况
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

// 确保在浏览器环境中挂载到 window 对象
if (typeof window !== 'undefined') {
    window.handleMixedAIAnalysisGlobal = handleMixedAIAnalysisGlobal;
}
