const express = require('express');
const https = require('https');
const http = require('http');
const axios = require('axios');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 图片代理接口
app.get('/api/4c/proxy/image', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
      return res.status(400).send('缺少目标图片URL参数');
    }

    // 根据目标域名设置不同的 Referer
    let referer = new URL(targetUrl).origin + '/';
    if (targetUrl.includes('xhscdn') || targetUrl.includes('xiaohongshu')) {
      referer = 'https://www.xiaohongshu.com/';
    } else if (targetUrl.includes('hdslb')) {
      referer = 'https://www.bilibili.com/';
    }

    // 发起请求获取目标图片
    const response = await axios.get(targetUrl, {
      responseType: 'stream',
      // 可以根据需要添加请求头，绕过部分防盗链
      headers: {
        'Referer': referer,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36'
      }
    });

    // 设置响应头，保持与源图片一致的类型
    res.setHeader('Content-Type', response.headers['content-type']);
    
    // 将图片流转发给前端
    response.data.pipe(res);

  } catch (error) {
    console.error('图片代理错误:', error.message);
    res.status(500).send('图片代理请求失败');
  }
});


// 启动服务器
const PORT = 7021;

http.createServer(app).listen(PORT, () => {
    console.log(`后端服务已启动，端口：${PORT}`);
    console.log(`接口地址：http://localhost:${PORT}/api/proxy/image`);
});