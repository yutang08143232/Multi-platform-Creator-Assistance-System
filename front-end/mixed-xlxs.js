// 导出混合平台视频数据到Excel
function exportToMixedExcel(allResults) {
    if (!allResults || allResults.length === 0) {
        alert('没有可导出的数据，请先解析视频');
        return;
    }

    const exportData = allResults.filter(item => item != null).map(item => {
        // 基础字段
        const row = {
            '平台': item.platform === 'bilibili' ? 'B站' : (item.platform === 'douyin' ? '抖音' : (item.platform === 'kuaishou' ? '快手' : (item.platform === 'xiaohongshu' ? '小红书' : '未知'))),
            '视频ID/链接': item.bvid || item.vid || item.url,
            '视频标题': item.title,
            '作者': item.author,
        };

        // 播放量 (B站/快手)
        if (['bilibili', 'kuaishou'].includes(item.platform)) {
            row['播放量'] = item.stat.view === '-' ? '' : item.stat.view;
        } else {
            row['播放量'] = '-';
        }

        // 点赞数 (全平台)
        row['点赞数'] = item.stat.like === '-' ? '' : item.stat.like;

        // 评论数 (全平台 - 字段名映射)
        const commentCount = item.stat.reply || item.stat.comment;
        row['评论数'] = commentCount === '-' ? '' : commentCount;

        // 收藏数 (B站/抖音)
        if (['bilibili', 'douyin'].includes(item.platform)) {
            row['收藏数'] = item.stat.favorite === '-' ? '' : item.stat.favorite;
        } else {
            row['收藏数'] = '-';
        }

        // 硬币数 (B站特有)
        if (item.platform === 'bilibili') {
            row['硬币数'] = item.stat.coin === '-' ? '' : item.stat.coin;
        } else {
            row['硬币数'] = '-';
        }

        // 分享数 (全平台)
        row['分享数'] = item.stat.share === '-' ? '' : item.stat.share;

        // 弹幕数 (B站特有)
        if (item.platform === 'bilibili') {
            row['弹幕数'] = item.stat.danmaku === '-' ? '' : item.stat.danmaku;
        } else {
            row['弹幕数'] = '-';
        }

        // 推荐数 (抖音特有)
        if (item.platform === 'douyin') {
            row['推荐数'] = item.stat.recommend === '-' ? '' : item.stat.recommend;
        } else {
            row['推荐数'] = '-';
        }

        // 综合评分 (如果有)
        row['综合评分'] = item.finalScore !== undefined ? item.finalScore.toFixed(4) : '';

        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '混合视频数据');

    const fileName = `混合平台统计数据_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

// 导出最近混合平台数据到Excel (预留接口，逻辑类似)
function exportRecentMixedDataToExcel(data) {
    if (!data || data.length === 0) {
        alert('没有可导出的数据');
        return;
    }
    // 逻辑与上面类似，根据传入的data结构进行适配
    exportToMixedExcel(data);
}

// 确保在浏览器环境中挂载到 window 对象
if (typeof window !== 'undefined') {
    window.exportToMixedExcel = exportToMixedExcel;
    window.exportRecentMixedDataToExcel = exportRecentMixedDataToExcel;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        exportToMixedExcel,
        exportRecentMixedDataToExcel
    };
}
