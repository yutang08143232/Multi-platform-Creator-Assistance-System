const express = require('express');
const app = express();
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const http = require('http');
const https = require('https');
require('dotenv').config({ path: './env.env' }); 

app.use(express.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'OPTIONS', 'POST'],
    allowedHeaders: ['Content-Type']
}));

const apiKey = process.env.DEEPSEEK_API_KEY;
const deepseekUrl = 'https://api.deepseek.com/v1/chat/completions';
const systemPrompt = `你是专业视频数据分析师，基于提供数据分析，严格遵循：

1. **格式要求**：
   - 仅用层级标题（如"1. 数据概况"）+ 短句列表（用"•"开头）呈现，禁止大段文字；
   - 每个模块下分点不超过3条，每条不超过2行，数据直接嵌入短句；
   - 关键数据加粗（如**597万**），指标名称用【】标注（如【播放量】）。

2. **内容要求**：
   - 数据概况：• 视频数量 • 核心数据范围（最高/最低值）• 核心创作者；
   - 表现分析：• TOP1视频关键数据 • 高表现视频2个共性特征；
   - 维度洞察：• 【播放量】与互动率关系（配1组数据）• 1个核心指标分析；
   - 评论分析：• 观众主要反馈（基于评论提炼）• 情感倾向（正面/负面比例）；
   - 改进建议：• 低表现视频具体建议（1条）• 内容优化方向（1条）；
   - 趋势预测：• 1条明确的创作趋势（带数据支撑）。

3. **评论区分析**：
   - 评论分析：针对评分较高的三个视频，分析其评论区的主要反馈和情感倾向；
   - 评论数据：情感分析（正面/负面）、评论内容（提炼主要反馈）；

要求：逻辑递进，无重复表述，字符组织紧凑，一眼可见核心信息。`;

app.post('/api/4c/chat', async (req, res) => {
    const { messages } = req.body;
    
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        // 提取前端提供的system prompt，如果没有则使用默认值
        let effectiveSystemPrompt = systemPrompt;
        const systemMessage = messages.find(msg => msg.role === 'system');
        if (systemMessage && systemMessage.content) {
            effectiveSystemPrompt = systemMessage.content;
        }
        
        const response = await axios.post(
            deepseekUrl,
            {
                messages: messages,
                system_prompt: effectiveSystemPrompt,
                model: "deepseek-chat",
                stream: true  // 启用流式响应
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'stream'  // 声明接收流式响应
            }
        );

        // 处理流式数据
        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    if (data === '[DONE]') {
                        res.write(`data: ${data}\n\n`);
                        res.end();  // 结束流
                        return;
                    }
                    // 转发流式数据到客户端
                    res.write(`data: ${data}\n\n`);
                }
            }
        });

        // 监听流结束
        response.data.on('end', () => {
            res.end();
        });
        
    } catch (error) {
        console.error('调用Deepseek API时出错:', error);
        res.write(`data: ${JSON.stringify({ 
            error: '服务器错误',
            details: error.response?.data || error.message
        })}\n\n`);
        res.end();
    }
});

const port = 7020;
http.createServer(app).listen(port, () => {
    console.log(`Server running on port ${port}`);
});