/**
 * 从SESSDATA中提取时间戳并转换为过期时间
 * @param {string} cookieContent - Cookie内容字符串
 * @returns {Object} - 包含处理后数据的对象
 */
function processCookie(cookieContent) {
    const sessdataRegex = /SESSDATA=([^;]+)/;
    const match = cookieContent.match(sessdataRegex);
    
    if (!match) {
        throw new Error('未找到SESSDATA');
    }
    
    const sessdataParts = match[1].split('%2C');
    if (sessdataParts.length < 2) {
        throw new Error('SESSDATA格式不正确，无法提取时间戳');
    }
    
    const timestamp = parseInt(sessdataParts[1], 10) * 1000; 
    const expireDate = new Date(timestamp);

    const formatTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };
    
    return {
        cookieContent,
        timestamp: sessdataParts[1],
        expireTime: formatTime(expireDate),
        expireDate: expireDate
    };
}

/**
 * 向数据库提交Cookie的函数
 * @param {string} cookieContent - Cookie内容字符串
 * @param {string} expireTime - 过期时间字符串
 * @returns {Promise<Object>} - 提交结果
 */
async function submitCookieToDatabase(cookieContent, expireTime) {
    const formatTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    const currentTime = formatTime(new Date());
    const apiUrl = 'https://yutangxiaowu.cn:6012/api/cookie/add';

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                cookie_content: cookieContent,
                create_time: currentTime,
                expire_time: expireTime
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `提交失败，状态码：${response.status}`);
        }

        return {
            success: true,
            message: result.message,
            data: result
        };
    } catch (error) {
        return {
            success: false,
            message: error.message,
            error: error
        };
    }
}

// 批量处理并提交Cookie
(async () => {
    const cookies = [
        "SESSDATA=514b14be%2C1779073196%2C0f8c1%2Ab1CjB_ra07wIWSQqD-XANpQTpIYXN2cGMe3iLxMBfDvLCH0oklC5cRhQ3Dj4ku-327M40SVkdja2lLeERBTjFVbkk2d2xSa2VmeDNxS25wREZPWXkzM3dteW9JNHJuRDl6SDgzcERjYU9HRVR2aDRoSlJPTVJsa2FSc0YxODY4aEQ2QkZXcllxWmRBIIEC; bili_jct=392a7edae28b42ade0b94f0ab4ec434b; DedeUserID=1651021325; DedeUserID__ckMd5=e0972d004b3c2c35; sid=5ynun4kl; theme-tip-show=SHOWED; CURRENT_QUALITY=0; rpdid=0zbfVLuoz6|2h2vTQb4|vPS|3w1Vlyqt; CURRENT_FNVAL=2000; home_feed_column=4; browser_resolution=1152-932; theme-avatar-tip-show=SHOWED",
        
        "SESSDATA=a7f40488%2C1779068399%2C3c8ff%2Ab1CjBxfD-pwhAxE5u85hrClQ5EV291bkUlgjaH-aSctkOhUUQLxe2E8RIkb0Ty3Fke_34SVmhOMHNvdTlRUV9GUHphSFJrZWpaRWlfUlljRExWRFluSjNCNHI5bTBudks2Z2J3aTlVYTFhbG1iX1R4V29RTEowU1pscTRRZ1Y2ZUNhTWhHUEI4TE53IIEC; bili_jct=149f90d77c484f32afe1b1e739a19eec; DedeUserID=630880683; DedeUserID__ckMd5=33f6a38b3257d9f8; sid=oglbom0e",
        
        "SESSDATA=c7375373%2C1774286332%2Cabd17%2A92CjAjG1OG8gyDuKd9Uo091o5eZCbqPDoA3xl_ll0hxb02Jwhn-XXjsXxk5QS91yNkubASVjk1cTFyMldBQkt3c3o4TUNKVzVGNEtUWXdoeVpCSHFCYTI0ZTJuVUYtd2xiWXV6SGM2SDF5NVBNVnZabTVJaWxFR3NBOEFxM1g3emhiS091dERqbXF3IIEC; bili_jct=c7eb5242bd7d995bdf004daa953463c2; DedeUserID=1638534634; DedeUserID__ckMd5=a490e866392c8c63; sid=h223a8j1",
                
        "SESSDATA=4719ce73%2C1778253049%2Ce141a%2Ab1CjBMCBO6Kl9Vm82Cub4Vc3B8YoSOoCyDlf_-eqzY36SkuYTjP1UUngrHHmveh79g8_MSVkloSEdockJoNFlsODE1NFNERmgwdVVoQVB6QkFuV1VjMHkyQUYwTkYxVjZ5QlZTN2ZSSzF6WkN4U1E0NXNKM0s5al9iWmdpenQ2UnNWVFd2WHJyWjN3IIEC; bili_jct=6af2769a3600bf1a024a79a25952ff10; sid=4n2rkl6u; buvid_fp=083d8a4b3869b5b23cd2d44001a7e8be",
    ]

    // 批量处理并提交
    for (const cookie of cookies) {
            const processed = processCookie(cookie);
            console.log(`处理Cookie: 时间戳=${processed.timestamp}, 过期时间=${processed.expireTime}`);
            const result = await submitCookieToDatabase(cookie, processed.expireTime);
    }
})();