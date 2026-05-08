from playwright.sync_api import sync_playwright
from flask import Response, request, Flask
from flask_cors import CORS
from datetime import datetime
import json
import re
import requests
import os  # 新增：用于证书路径校验
import ssl
import traceback
import jwt
from functools import wraps

# 加载公钥
PUBLIC_KEY_PATH = os.path.join(os.path.dirname(__file__), './keys/public.pem')
try:
    with open(PUBLIC_KEY_PATH, 'r') as f:
        JWT_PUBLIC_KEY = f.read()
except Exception as e:
    print(f"Warning: Could not load public key from {PUBLIC_KEY_PATH}: {e}")
    JWT_PUBLIC_KEY = None

def verify_token(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not JWT_PUBLIC_KEY:
            return Response(
                json.dumps({'code': -1, 'msg': '服务端未配置公钥'}, ensure_ascii=False),
                content_type='application/json; charset=utf-8',
                status=500
            )
            
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return Response(
                json.dumps({'code': -1, 'msg': '未携带Token'}, ensure_ascii=False),
                content_type='application/json; charset=utf-8',
                status=401
            )
            
        token = auth_header.split(' ')[1]
        if not token:
            return Response(
                json.dumps({'code': -1, 'msg': 'Token格式错误'}, ensure_ascii=False),
                content_type='application/json; charset=utf-8',
                status=401
            )
            
        try:
            decoded = jwt.decode(token, JWT_PUBLIC_KEY, algorithms=['RS256'])
            # 可以将用户信息挂载到 request 或 g 对象上，如果有需要
        except jwt.ExpiredSignatureError:
            return Response(
                json.dumps({'code': -1, 'msg': 'Token验证失败: jwt expired'}, ensure_ascii=False),
                content_type='application/json; charset=utf-8',
                status=401
            )
        except jwt.InvalidTokenError as e:
            return Response(
                json.dumps({'code': -1, 'msg': f'Token验证失败: {str(e)}'}, ensure_ascii=False),
                content_type='application/json; charset=utf-8',
                status=401
            )
        except Exception as e:
            return Response(
                json.dumps({'code': -1, 'msg': f'Token验证失败: {str(e)}'}, ensure_ascii=False),
                content_type='application/json; charset=utf-8',
                status=401
            )
            
        return f(*args, **kwargs)
    return decorated_function

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

def format_create_time(timestamp):
    """将时间戳转换为YYYY-MM-DD格式"""
    try:
        return datetime.fromtimestamp(int(timestamp)).strftime("%Y-%m-%d")
    except:
        return ""

def send_video_data(token, data, vid):
    """发送视频数据到指定API端点"""
    try:
        # 构建请求数据
        payload = {
            "data": data,
            "vid": vid,
            "api_endpoint": "/api/combinedVideo/douyin"
        }
        
        headers = {
            "Authorization": token
        }

        # 发送POST请求（忽略SSL验证）
        response = requests.post(
            url="https://yutangxiaowu.cn:6012/api/douyin/video",
            json=payload,
            headers=headers,
            verify=False,
            timeout=10
        )
        
        # 检查响应状态
        response.raise_for_status()
        print(f"数据写入成功 - 视频号: {vid}, 服务器响应:", response.json())
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"数据写入失败 - 视频号: {vid}, 错误: {str(e)}")
        return False

def douyin_start():
    try:
        if request.method != 'POST':
            return Response(
                json.dumps({'code': 1, 'msg': '仅支持POST请求', 'data': {}}, ensure_ascii=False),
                content_type='application/json; charset=utf-8',
                status=405
            )
        
        if request.is_json:
            content = request.get_json()
        elif request.form:
            content = request.form.to_dict()
        else:
            return Response(
                json.dumps({'code': 1, 'msg': '未提交数据，请用JSON或表单格式传参', 'data': {}}, ensure_ascii=False),
                content_type='application/json; charset=utf-8'
            )
        
        try:
            content_str = content['content']
            # 从请求头获取Token
            token = request.headers.get('Authorization', '')
            bvid = content.get('bvid', '')       
        except Exception:
            return Response(
                json.dumps({'code': 1, 'msg': '缺少content参数', 'data': {}}, ensure_ascii=False),
                content_type='application/json; charset=utf-8'
            )

        pattern = r'https?://(?:v\.douyin\.com/[^/?#]+|douyin\.com/video/[^/?#]+)'
        matches = re.findall(pattern, content_str)
        if not matches:
                return Response(
            json.dumps({
                'code': 1,
                'msg': '未找到抖音链接，正确格式：https://v.douyin.com/xxxxx 或 https://douyin.com/video/xxxxx',
                'data': {}
            }, ensure_ascii=False),
            content_type='application/json; charset=utf-8'
      )
        
        match_url = matches[0]
        response = requests.get(url=match_url, timeout=10)
        if 'note' in response.url:
            result = douyin_note(response.url, token, bvid)
        else:
            vid = response.url.split('/')[-1]
            result = douyin_video(response.url, token, vid)
        return Response(result, content_type='application/json; charset=utf-8')
    except Exception as e:
        return Response(
            json.dumps({'code': 1, 'msg': f'接口处理失败：{str(e)}', 'data': {}}, ensure_ascii=False),
            content_type='application/json; charset=utf-8'
        )

def douyin_note(url, token, bvid):
    # 函数实现保持不变（已使用传入的user_id）
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--lang=zh-CN,zh;q=0.9",
                    "--timezone=Asia/Shanghai"
                ]
            )
            
            context = browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0',
                viewport={'width': 1920, 'height': 1080},
                color_scheme='light',
                locale='zh-CN',
                timezone_id='Asia/Shanghai',
                extra_http_headers={
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br'
                },
                permissions=['geolocation'],
                geolocation={'latitude': 39.9042, 'longitude': 116.4074},
                device_scale_factor=1.0,
                is_mobile=False,
                has_touch=False,
                java_script_enabled=True
            )
            
            page = context.new_page()
            page.add_init_script("""
                Object.defineProperty(navigator, 'platform', {get: () => 'Win32'});
                Object.defineProperty(navigator, 'userAgentData', {
                    get: () => ({
                        platform: 'Windows',
                        brands: [{brand: 'Google Chrome', version: '138'}, {brand: 'Not;A Brand', version: '99'}],
                        mobile: false
                    })
                });
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            """)
            
            page.goto(url, wait_until="commit", timeout=15000)
            last_url = page.url
            stable_seconds = 0
            check_interval = 300
            stable_threshold = 1000
            
            while stable_seconds < stable_threshold:
                current_url = page.url
                if current_url == last_url:
                    stable_seconds += check_interval
                else:
                    last_url = current_url
                    stable_seconds = 0
                page.wait_for_timeout(check_interval)
            
            response = page.goto(page.url)
            html_content = response.text()
            browser.close()
        
        pattern = r'self\.__pace_f\.push\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)'
        matches = re.findall(pattern, html_content, re.DOTALL)
        if not matches:
            return json.dumps({'code': 1, 'msg': '未找到图文笔记数据', 'data': {}}, ensure_ascii=False)
            
        last_match = matches[-1].strip()
        match = re.search('"\\d+:(.*?)\\\\n"', last_match)
        if not match:
            return json.dumps({'code': 1, 'msg': '解析图文笔记失败', 'data': {}}, ensure_ascii=False)
        
        last_match = match.group(1)
        last_match = re.sub(r'(\\+)', lambda m: m.group(1)[:-1], last_match)
        last_match = re.sub(r'(\\+)', lambda m: m.group(1)[:-1], last_match)
        last_match = last_match.replace('u0026', '&')
        
        data = json.loads(last_match)[3]
        aweme_detail = data['aweme']['detail']
        # 提取视频ID（从URL中解析）
        vid = re.search(r'/note/(\d+)', url).group(1) if re.search(r'/note/(\d+)', url) else ''
        
        result = {
            "code": 0,
            "msg": "数据解析成功",
            "data": {
                "vid": vid,
                "video": {
                    "title": aweme_detail.get('desc', '无标题'),
                    "fm": aweme_detail['video']['coverUrlList'][0] if ('video' in aweme_detail and aweme_detail['video'].get('coverUrlList')) else "",
                    "lx": "图文",  # 明确类型为图文
                    "desc": aweme_detail.get('desc', ''),
                    "max_qxd": "",  # 图文笔记无清晰度
                    "url": ""       # 图文笔记无视频URL
                },
                "owner": {
                    "name": aweme_detail['authorInfo'].get('nickname', '未知作者'),
                    "mid": aweme_detail['authorInfo'].get('uid', ''),
                    "face": aweme_detail['authorInfo']['avatarThumb'].get('urlList', [''])[0]
                },
                "stat": {
                    "reply": aweme_detail['stats']['commentCount'],
                    "favorite": aweme_detail['stats']['collectCount'],
                    "recommend": aweme_detail['stats'].get('recommendCount', 0),
                    "share": aweme_detail['stats']['shareCount'],
                    "like": aweme_detail['stats']['diggCount'],
                    "time": format_create_time(aweme_detail.get('createTime', ''))
                },
                "type": "image"  # 图文类型
            }
        }
        
        # 发送数据到API
        send_video_data(token, result['data'], vid)
            
        return json.dumps(result, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({'code': 1, 'msg': f'图文笔记解析失败：{str(e)}', 'data': {}}, ensure_ascii=False)

def douyin_video(url, token, vid):
    # 函数实现保持不变（已使用传入的user_id）
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0"
                ]
            )
            
            context = browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0',
                viewport={'width': 1920, 'height': 1080},
                screen={'width': 1920, 'height': 1080},
                locale='zh-CN',
                timezone_id='Asia/Shanghai',
                extra_http_headers={'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'},
                java_script_enabled=True,
                device_scale_factor=1,
                is_mobile=False,
                has_touch=False
            )
            
            page = context.new_page()
            page.add_init_script("""
                Object.defineProperty(navigator, 'platform', {get: () => 'Win32'});
                Object.defineProperty(navigator, 'userAgentData', {
                    get: () => ({
                        platform: 'Windows',
                        brands: [{brand: 'Google Chrome', version: '138'}, {brand: 'Not;A Brand', version: '99'}],
                        mobile: false
                    })
                });
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            """)
            
            page.goto(url, wait_until="domcontentloaded", timeout=15000)
            api_data = None
            try:
                response = page.wait_for_event(
                    "response",
                    lambda res: "https://www.douyin.com/aweme/v1/web/aweme/detail/" in res.url,
                    timeout=15000
                )
                api_data = response.json()['aweme_detail']
            except Exception as e:
                return json.dumps({'code': 1, 'msg': f'捕获视频接口失败：{str(e)}', 'data': {}}, ensure_ascii=False)
            
            browser.close()
        
        # 提取视频ID
        vid = api_data.get('aweme_id', '')
        # 获取最高清晰度视频URL
        max_quality_url = ""
        max_quality = ""
        if 'bit_rate' in api_data['video']:
            # 按清晰度排序找最高质量
            sorted_bitrate = sorted(
                api_data['video']['bit_rate'],
                key=lambda x: int(re.search(r'(\d+)', x.get('gear_name', '0')).group(1)) if re.search(r'(\d+)', x.get('gear_name', '0')) else 0,
                reverse=True
            )
            if sorted_bitrate:
                max_quality = sorted_bitrate[0].get('gear_name', '未知清晰度')
                max_quality_url = sorted_bitrate[0]['play_addr'].get('url_list', [''])[0]

            if 'video' in api_data and 'bit_rate' in api_data['video']:
            # 按清晰度降序排序（提取gear_name中的数字作为排序依据）
             sorted_bitrate = sorted(
                api_data['video']['bit_rate'],
                key=lambda x: int(re.search(r'(\d+)', x.get('gear_name', '0')).group(1)) if re.search(r'(\d+)', x.get('gear_name', '0')) else 0,
                reverse=True
            )
            
            if sorted_bitrate:
                top_bitrate = sorted_bitrate[0]
                max_quality = top_bitrate.get('gear_name', '未知清晰度')
                url_list = top_bitrate['play_addr'].get('url_list', [])
                
                # 筛选包含"v3"的地址，无则取第一个
                v3_urls = [url for url in url_list if 'v3' in url]
                max_quality_url = v3_urls[0] if v3_urls else (url_list[0] if url_list else '')
        
        
        result = {
            "code": 0,
            "msg": "数据解析成功",
            "data": {
                "vid": vid,
                "video": {
                    "title": api_data.get('preview_title', '无标题'),
                    "fm": api_data['video']['cover_original_scale'].get('url_list', [''])[0] if ('video' in api_data and 'cover_original_scale' in api_data['video']) else "",
                    "lx": "综合",
                    "desc": api_data.get('desc', ''),
                    "max_qxd": max_quality,
                    "url": max_quality_url
                },
                "owner": {
                    "name": api_data['author'].get('nickname', '未知作者'),
                    "mid": api_data['author'].get('uid', ''),
                    "face": api_data['author']['avatar_thumb'].get('url_list', [''])[0]
                },
                "stat": {
                    "reply": api_data['statistics']['comment_count'],
                    "favorite": api_data['statistics']['collect_count'],
                    "recommend": api_data['statistics'].get('recommend_count', 0),
                    "share": api_data['statistics']['share_count'],
                    "like": api_data['statistics']['digg_count'],
                    "time": format_create_time(api_data.get('create_time', ''))
                },
                "type": "video"
            }
        }
        
        # 发送数据到API
        send_video_data(token, result['data'], vid)
                
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        return json.dumps({'code': 1, 'msg': f'视频解析失败：{str(e)}', 'data': {}}, ensure_ascii=False)

def dy_videolink():
    query_string = request.query_string.decode('utf-8')
    url_start = query_string.find('content=') + 8
    url = query_string[url_start:] if url_start >= 8 else ''
    
    if not url:
        return Response(
            json.dumps({'code': 1, 'msg': '缺少content参数（需传入视频链接）', 'data': {}}, ensure_ascii=False),
            content_type='application/json; charset=utf-8',
            status=400
        )
    
    headers = {
        "Accept-Encoding": "identity;q=1, *;q=0",
        "Accept": "*/*",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Dest": "video",
        "Referer": url,
        "Range": "bytes=0-",
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; V2203A Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.179 Mobile Safari/537.36"
    }
    
    try:
        response = requests.get(url=url, headers=headers, stream=True, timeout=10)
        response.raise_for_status()
        content_type = response.headers.get('Content-Type', 'video/mp4')
        
        return Response(
            response.iter_content(chunk_size=8192),
            content_type=content_type,
            headers={
                'Content-Length': response.headers.get('Content-Length', ''),
                'Content-Disposition': 'inline'
            }
        )
    except requests.exceptions.RequestException as e:
        return Response(
            json.dumps({'code': 1, 'msg': f'获取视频失败：{str(e)}', 'data': {}}, ensure_ascii=False),
            content_type='application/json; charset=utf-8',
            status=500
        )

def dy_videocoverlink():
    query_string = request.query_string.decode('utf-8')
    url_start = query_string.find('content=') + 8
    url = query_string[url_start:] if url_start >= 8 else ''
    
    if not url:
        return Response(
            json.dumps({'code': 1, 'msg': '缺少content参数（需传入封面链接）', 'data': {}}, ensure_ascii=False),
            content_type='application/json; charset=utf-8',
            status=400
        )
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0"
    }
    
    try:
        response = requests.get(url=url, headers=headers, stream=True, timeout=10)
        response.raise_for_status()
        return Response(
            response.content,
            content_type=response.headers['Content-Type']
        )
    except requests.exceptions.RequestException as e:
        return Response(
            json.dumps({'code': 1, 'msg': f'获取封面失败：{str(e)}', 'data': {}}, ensure_ascii=False),
            content_type='application/json; charset=utf-8',
            status=500
        )

@app.route('/api/4c/douyin/parse', methods=['POST'])
@verify_token
def douyin_parse_route():
    return douyin_start()

@app.route('/api/4c/douyin/parse', methods=['POST'])
@verify_token
def douyin_parse_route_v2():
    return douyin_start()

@app.route('/api/douyin/video/stream', methods=['GET'])
def douyin_video_stream_route():
    return dy_videolink()

@app.route('/api/4c/douyin/video/stream', methods=['GET'])
def douyin_video_stream_route_v2():
    return dy_videolink()

@app.route('/api/douyin/cover/stream', methods=['GET'])
def douyin_cover_stream_route():
    return dy_videocoverlink()

@app.route('/api/4c/douyin/cover/stream', methods=['GET'])
def douyin_cover_stream_route_v2():
    return dy_videocoverlink()

@app.route('/api/4c/douyin', methods=['POST'])
@verify_token
def douyin_start_route():
    return douyin_start()

@app.route('/api/4c/douyin', methods=['POST'])
@verify_token
def douyin_start_route_v2():
    return douyin_start()

if __name__ == '__main__':
    # 启动HTTP服务
    print("服务启动中... HTTP地址：http://0.0.0.0:8001/api/4c/douyin/parse")
    app.run(
        host='0.0.0.0',
        port=7001,
        debug=False,  # 生产环境禁用debug
        threaded=True  # 多线程处理请求
    )