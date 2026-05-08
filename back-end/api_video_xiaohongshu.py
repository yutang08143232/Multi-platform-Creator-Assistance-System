import requests
import json
import re
from bs4 import BeautifulSoup
from flask import Flask, request, Response
from urllib.parse import urlparse, parse_qs, urlunparse
import os
from functools import wraps
import jwt

# 加载公钥
PUBLIC_KEY_PATH = os.path.join(os.path.dirname(__file__), 'keys/public.pem')
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

from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

@app.route('/api/xiaohongshu', methods=['GET', 'POST'])
@verify_token
def xiaohongshu_start():
    return process_xiaohongshu_request()

@app.route('/api/4c/xiaohongshu', methods=['GET', 'POST'])
@verify_token
def xiaohongshu_start_v2():
    return process_xiaohongshu_request()

def process_xiaohongshu_request():
    content = None
    if request.method == 'POST':
        if request.is_json:
            data = request.get_json()
            content = data.get('content')
        elif request.form:
            data = request.form.to_dict()
            content = data.get('content')
    elif request.method == 'GET':
        content = request.args.get('url') or request.args.get('content')

    if not content:
        return Response(json.dumps({'error':'未提交content参数'}, ensure_ascii=False), content_type='application/json; charset=utf-8')

    # 处理 content 可能是 list 的情况
    if isinstance(content, list):
        if content:
            content = content[0]
        else:
            return Response(json.dumps({'error':'content参数为空列表'}, ensure_ascii=False), content_type='application/json; charset=utf-8')
            
    try:
        pass
    except Exception as e:
        pass # Should not happen based on logic above
    
    headers = {'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0'}
    pattern = r'https?://xhslink\.com/[\w-]+/[\w-]+'

    matches = re.findall(pattern, content)
    if matches:
        url = matches[0]
    else:
        pattern = r'https?://www\.xiaohongshu\.com/discovery/item/[a-zA-Z0-9]+[^\s]*'

        matches = re.findall(pattern, content)
        if matches:
            url = matches[0]
        else:
            pattern = r'https?://www\.xiaohongshu\.com/explore/[a-zA-Z0-9]+[^\s]*'

            matches = re.findall(pattern, content)
            if matches:
                url = matches[0]
            else:
                return Response(json.dumps({'error':'未找到小红书分享链接，请您检查你提供的内容'}, ensure_ascii=False), content_type='application/json; charset=utf-8')
    

    res = requests.get(url=url,headers=headers)
    url = res.url
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    if 'xsec_token' not in query:
        pass
    
    new_query = {'xsec_token': query['xsec_token'][0]} if 'xsec_token' in query else {}
    if not new_query:
        url_for_request = url
    else:
        url_for_request = urlunparse(parsed._replace(query='&'.join(f"{k}={v}" for k, v in new_query.items())))
    
    url_for_request = url_for_request.replace('discovery/item','explore')
    
    # Add Referer
    headers['Referer'] = 'https://www.xiaohongshu.com/'
    
    response = requests.get(url=url_for_request, headers=headers)
    soup = BeautifulSoup(response.text, 'html.parser')

    # 找到包含 window.__INITIAL_STATE__ 的 script 标签
    all_scripts = soup.find_all('script')
    json_str = None
    
    pattern = r'window\.__INITIAL_STATE__\s*=\s*(.*?)(?=;\s*$|$)'
    
    # 优先检查最后一个，因为通常在这里
    if all_scripts:
        matches = re.search(pattern, all_scripts[-1].text)
        if matches:
            json_str = matches.group(1)
            
    # 如果最后一个没有，遍历所有 script
    if not json_str:
        for script in all_scripts:
            matches = re.search(pattern, script.text)
            if matches:
                json_str = matches.group(1)
                break

    if json_str:
        json_str = json_str.replace('undefined','null')
    else:
        return Response(json.dumps({'error':'数据匹配失败', 'details': '未找到状态数据，可能是触发了验证码'}, ensure_ascii=False), content_type='application/json; charset=utf-8')
    try:
        data = json.loads(json_str)
    except:
        return Response(json.dumps({'error':'json加载失败'}, ensure_ascii=False), content_type='application/json; charset=utf-8')
    try:
        li = data['note']['noteDetailMap']
        res = li[list(li)[0]]['note']
        
        # 提取公共信息
        vid = res['noteId']
        title = res['title']
        desc = res.get('desc', '')
        full_title = title + desc
        author = res['user']['nickname']
        # avatar = res['user']['avatar']
        
        # 统计数据
        likes = res['interactInfo']['likedCount']
        commentCount = res['interactInfo']['commentCount']
        shareCount = res['interactInfo']['shareCount']
        collectedCount = res['interactInfo']['collectedCount']
        viewCount = "0" # 暂时无法获取
        
        createTime = res['time']
        
        videoUrlResult = ""
        coverUrl = ""
        durationFormatted = ""
        images = []
        
        if res['type'] == 'video':
            # 视频处理
            try:
                # 尝试获取 masterUrl
                stream_list = res['video']['media']['stream']['h264']
                if stream_list:
                    videoUrlResult = stream_list[0]['masterUrl']
                    duration_ms = stream_list[0].get('duration', 0)
                    m, s = divmod(duration_ms / 1000, 60)
                    durationFormatted = f"{int(m):02d}:{int(s):02d}"
            except:
                pass
            
            # 封面图
            if res.get('imageList'):
                coverUrl = res['imageList'][0].get('urlDefault', '')
                if not coverUrl and res['imageList'][0].get('infoList'):
                     coverUrl = res['imageList'][0]['infoList'][1]['url']
                images.append(coverUrl)

        elif res['type'] == 'normal':
             # 图文或Live Photo
             for img in res.get('imageList', []):
                 img_url = img.get('urlDefault', '')
                 if not img_url and img.get('infoList'):
                      # 尝试获取 infoList 中的 url
                      for info in img['infoList']:
                           if info.get('url'):
                                img_url = info['url']
                                break
                 if img_url:
                      images.append(img_url)
             
             if images:
                 coverUrl = images[0]
                 
             if res['imageList'] and res['imageList'][0].get('livePhoto'):
                  pass

        # 构造返回数据
        data = {
            "vid": vid,
            "video": {
                "title": title, # 使用纯标题
                "url": videoUrlResult,
                "fm": coverUrl,
                "duration": durationFormatted
            },
            "owner": {
                "name": author
            },
            "stat": {
                "view": viewCount,
                "like": likes,
                "comment": commentCount,
                "share": shareCount
            },
            "createTime": createTime,
            "images": images,
            "songName": "",
            "audioUrl": ""
        }
        
        # 自动保存数据到数据库 (从小红书解析结果中获取)
        # 这里需要从请求头中获取 Token
        auth_header = request.headers.get('Authorization')
        if auth_header:
            try:
                # 尝试从 Token 中解析 user_id (虽然 sql.js 会自己解析，但为了日志记录)
                token = auth_header.split(' ')[1]
                decoded = jwt.decode(token, JWT_PUBLIC_KEY, algorithms=['RS256'])
                user_id = decoded.get('username')
                
                # 发送数据到 sql.js
                try:
                    requests.post('https://api.yutangxiaowu.cn/api/xiaohongshu/video', json={
                        'data': data
                    }, headers={
                        'Authorization': auth_header
                    }, timeout=5, verify=False)
                    print(f"小红书数据自动保存成功 - 用户: {user_id}")
                except requests.exceptions.RequestException as e:
                    print(f"小红书数据自动保存请求失败: {e}")
            except Exception as e:
                print(f"小红书数据自动保存逻辑错误: {e}")

        return Response(json.dumps({'code': 0, 'msg': '解析成功!', 'data': data}, ensure_ascii=False), content_type='application/json; charset=utf-8')        
    except Exception as e:
        print(e)
        return Response(json.dumps({'code': -1, 'msg': '数据解析失败', 'error': str(e)}, ensure_ascii=False), content_type='application/json; charset=utf-8')

if __name__ == '__main__':
    # 启动HTTP服务
    print("服务启动中... HTTP地址：http://0.0.0.0:7002/api/xiaohongshu")
    app.run(
        host='0.0.0.0',
        port=7002,
        debug=False,
        threaded=True
    )