// 导出B站视频数据到Excel
function exportToBiliExcel() {
    if (window.allResults.length === 0) {
        alert('没有可导出的数据，请先解析视频');
        return;
    }

    const exportData = window.allResults.filter(item => item != null).map(item => ({
        'BV号': item.bvid,
        '视频标题': item.title,
        '作者': item.author,
        '播放量': item.stat.view === '-' ? '' : item.stat.view,
        '弹幕数': item.stat.danmaku === '-' ? '' : item.stat.danmaku,
        '评论数': item.stat.reply === '-' ? '' : item.stat.reply,
        '收藏数': item.stat.favorite === '-' ? '' : item.stat.favorite,
        '硬币数': item.stat.coin === '-' ? '' : item.stat.coin,
        '分享数': item.stat.share === '-' ? '' : item.stat.share,
        '点赞数': item.stat.like === '-' ? '' : item.stat.like,
        '综合得分': item.totalScore ? item.totalScore.toFixed(4) : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'B站视频数据');

    const fileName = `B站统计数据_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

// 导出抖音视频数据到Excel
function exportToDouyinExcel() {
    if (window.allResults.length === 0) {
        alert('没有可导出的数据，请先解析视频');
        return;
    }

    const exportData = window.allResults.filter(item => item != null).map(item => ({
        'vid': item.vid,
        '视频标题': item.title,
        '作者': item.author,
        '评论数': item.stat.reply === '-' ? '' : item.stat.reply,
        '收藏数': item.stat.favorite === '-' ? '' : item.stat.favorite,
        '推荐数': item.stat.recommend === '-' ? '' : item.stat.recommend,
        '分享数': item.stat.share === '-' ? '' : item.stat.share,
        '点赞数': item.stat.like === '-' ? '' : item.stat.like,
        '综合得分': item.totalScore ? item.totalScore.toFixed(4) : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '抖音视频数据');

    const fileName = `抖音统计数据_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

// 导出快手视频数据到Excel
function exportToKuaishouExcel() {
    if (window.allResults.length === 0) {
        alert('没有可导出的数据，请先解析视频');
        return;
    }

    const exportData = window.allResults.filter(item => item != null).map(item => ({
        'vid': item.vid,
        '视频标题': item.title,
        '作者': item.author,
        '播放量': item.stat.view === '-' ? '' : item.stat.view,
        '点赞数': item.stat.like === '-' ? '' : item.stat.like,
        '评论数': item.stat.comment === '-' ? '' : item.stat.comment,
        '分享数': item.stat.share === '-' ? '' : item.stat.share,
        '综合得分': item.totalScore ? item.totalScore.toFixed(4) : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '快手视频数据');

    const fileName = `快手统计数据_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

// 导出小红书视频数据到Excel
function exportToXiaohongshuExcel() {
    if (window.allResults.length === 0) {
        alert('没有可导出的数据，请先解析视频');
        return;
    }

    const exportData = window.allResults.filter(item => item != null && item.platform === 'xiaohongshu').map(item => ({
        'vid': item.vid,
        '视频标题': item.title,
        '作者': item.author,
        '点赞数': item.stat.like === '-' ? '' : item.stat.like,
        '评论数': item.stat.comment === '-' ? '' : item.stat.comment,
        '分享数': item.stat.share === '-' ? '' : item.stat.share,
        '综合得分': item.totalScore ? item.totalScore.toFixed(4) : ''
    }));

    if (exportData.length === 0) {
        alert('没有小红书视频数据可导出');
        return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '小红书视频数据');

    const fileName = `小红书统计数据_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

// 导出最近B站数据到Excel
function exportRecentBiliDataToExcel(data) {
    if (!data || data.length === 0) {
        alert('没有可导出的数据');
        return;
    }

    const exportData = data.filter(item => item != null).map(item => {
        // 查找对应的综合得分
        const recentItem = window.recentResults.find(r => r.bvid === item.bvid);

        return {
            'ID': item.id,
            'BV号': item.bvid,
            '视频标题': item.title,
            '作者': item.owner_name,
            '类型': item.lx || '-',
            '播放量': item.view,
            '弹幕数': item.danmaku,
            '评论数': item.reply,
            '收藏数': item.favorite,
            '硬币数': item.coin,
            '分享数': item.share,
            '点赞数': item.like,
            '综合得分': recentItem && recentItem.totalScore ? recentItem.totalScore.toFixed(4) : '',
            '发布时间': formatDate(item.time),
            '录入时间': formatDate(item.created_at)
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '最近视频数据');

    const fileName = `B站最近视频数据_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

// 导出最近抖音数据到Excel
function exportRecentDouyinDataToExcel(data) {
    if (!data || data.length === 0) {
        alert('没有可导出的数据');
        return;
    }

    const exportData = data.filter(item => item != null).map(item => {
        // 查找对应的综合得分
        const recentItem = window.recentResults.find(r => r.vid === item.vid);

        return {
            'ID': item.id,
            '视频ID': item.vid,
            '视频标题': item.title,
            '作者': item.owner_name,
            '评论数': item.reply,
            '收藏数': item.favorite,
            '推荐数': item.recommend,
            '分享数': item.share,
            '点赞数': item.like,
            '综合得分': recentItem && recentItem.totalScore ? recentItem.totalScore.toFixed(4) : '',
            '发布时间': formatDate(item.time),
            '录入时间': formatDate(item.created_at)
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '最近抖音视频数据');

    const fileName = `抖音最近视频数据_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

// 导出最近快手数据到Excel
function exportRecentKuaishouDataToExcel(data) {
    if (!data || data.length === 0) {
        alert('没有可导出的数据');
        return;
    }

    const exportData = data.filter(item => item != null).map(item => {
        // 查找对应的综合得分
        const recentItem = window.recentResults.find(r => r.url === item.url);

        return {
            'ID': item.id,
            '视频链接': item.url,
            '视频标题': item.title,
            '作者': item.author,
            '播放量': item.view,
            '点赞数': item.like,
            '评论数': item.comment,
            '分享数': item.share,
            '综合得分': recentItem && recentItem.totalScore ? recentItem.totalScore.toFixed(4) : '',
            '发布时间': formatDate(item.time),
            '录入时间': formatDate(item.created_at)
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '最近快手视频数据');

    const fileName = `快手最近视频数据_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

// 日期格式化函数（如果在batch2.0.html中定义了，这里可能不需要，但为了xlxs.js独立性，最好保留或确保可访问）
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}
