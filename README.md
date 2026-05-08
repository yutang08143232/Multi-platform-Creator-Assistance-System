# 多源视频分析与创作者辅助系统 - 核心设计文档
---

## 一、算法设计
### 1. 单视频综合评分模型
系统对单个视频的评价不仅依赖播放量，而是通过加权模型综合衡量视频的“互动深度”与“传播质量”。

核心公式：
\[
TotalScore = \left( BaseScore \times 0.8 + RealismScore \times 0.2 \right) \times TimeDecay \times 100
\]

#### (1) 基础得分（BaseScore）
基础分是通过对各个互动指标（如播放量、点赞数、评论数等）进行归一化后，再乘以对应的权重进行加权求和得到的。系统一共设计了两套归一化配置计算其分值后乘以权重计算基础分。

\[
BaseScore = \sum \left( \text{指标归一化分值} \times \text{该指标权重} \right)
\]

**方法1：对数Min-Max缩放**
社交媒体领域，视频数据通常呈“长尾分布”（少数视频拥有数百万播放，多数视频仅有几百）。传统的线性归一化会导致大量中腰部视频的得分趋近于0，失去对比意义。
- 核心公式：
\[
f(v) = \frac{\ln(v + 1) - \ln(\min(v) + 1)}{\ln(\max(v) + 1) - \ln(\min(v) + 1)}
\]
- 优势：将“指数级”的增长差异，转化为“线性”的增长差异。1000万的对数约为16，1000的对数约为7，两者差距变成了不到3倍。这种压缩在物理空间上“拉平”了数据，让模型不再被极端值所带偏。

**方法2：Z-Score + Sigmoid标准化归一化**
- 核心公式：
\[
f(v) = \frac{1}{1 + e^{-\left( \frac{v - \mu}{\sigma} \right)}}
\]
- 提升分群精度：在平均值附近的这些视频，即使微小的互动数据增长，也会导致Sigmoid输出分值的明显跳动。这意味着，原本在原始数据中看起来平淡无奇、区分度极低的“潜力股”，在经过Sigmoid变换后，会被算法清晰地识别出来。

#### (2) 真实度得分（RealismScore）
真实度得分（RealismScore）是衡量内容互动健康度的核心，它旨在识别那些被用户喜爱的内容，而非仅仅是依靠流量堆砌的“冷门”视频，它的计算逻辑可以分为两个核心部分：

**加权互动率（Interaction Rate, IR）**
通过对不同维度的互动指标赋予不同权重，得出一个代表用户粘性的综合指标。
\[
IR = \sum_{Metric \in BaseMetric} \left( Metric_i \times Weight_i \right)
\]
- `Metric`：指点赞、评论、分享、收藏等指标的原始数量。
- `Weight`：各平台设定的互动权重。
- 互动率计算与样本过滤：互动率计算需要对“播放量”（或在缺乏播放数据时作为后备的分母），用于对总互动数进行标准化，得到单位流量下的平均互动权重。

**对数平滑处理**
互动率往往呈现“极少数头部爆款远高于普通内容”的分布。对数函数具有“压缩头部、拉伸腰部”的特性，能够让中腰部的优质内容与头部爆款之间的评分差距显得更加合理，不会让99%的内容因为互动率稍低就变成0分（对数函数增长缓慢，防止某个异常数据点（如互动率高达50%的视频）在评分时权重过大，导致其他视频失去了竞争力）。

- 公式：
\[
RealismScore = \begin{cases}
0.2, & \text{if } isLowData() \ (\text{样本量不足}) \\
\left( \frac{IR_i}{IR_{max}} \right), & \text{其他}
\end{cases}
\]
- $IR_i$：该视频的计算出的互动率。
- $IR_{max}$：为当前平台样本集中的最大互动率，作为归一化的标尺。

**防数据机制**
- 防刷机制（样本平滑）：在样本尾部，通过`ln(x)`对互动率进行映射，强制赋予0-2%的保守分。这一步直接切断了高刷互动导致的异常评分，防止“小样本爆款”对系统造成干扰。
- 优化机制（区分度）：将样本数据的首尾进行裁剪，通过`ln(x)`对互动率进行映射，此举将互动率的非线性分布“拉平”到[0,1]区间，在保证头部领先的同时，极大提升了中腰部内容的辨识度与区分度。

#### (3) 时间衰减系数（TimeDecay）
时间衰减函数（TimeDecay）是算法保持“新鲜度”的灵魂。它解决了一个核心矛盾：如何平衡视频的“历史贡献”（累计播放量）与“实时价值”（发布时间）？如果没有时间衰减，排行榜就会变成几年前的爆款霸榜，新入驻的创作者永远没有出头之日。
- 公式：
\[
TimeDecay = e^{-\lambda \cdot \Delta t}
\]
- $\lambda = \frac{\ln 2}{H}$，其中$H$为半衰期，默认365天。
- $\Delta t$：视频发布至今的天数。
- 优势：使用指数函数而非“一刀切”（例如发布30天直接删除）的好处在于它非常平滑。这保证了即便是长尾内容，在发布后的很长一段时间内依然有被推荐的可能，不会出现断崖式下跌。

---

### 2. 跨平台动态权重算法
在单平台计算得分的公式基础上，我们进一步引入动态平台权重计算：**“跨平台动态权重算法”**是决定内容如何从各个独立平台走向全网排名的核心引擎。它不仅仅是简单的加权相加，而是一套分层对齐与动态调节机制。

- 核心公式：
\[
TotalScore = \left( \sum_{i=1}^{n} S_i \times W_i \right) \times TimeDecay
\]
- $S_i$：视频在平台$i$的综合得分（上文的$0.8 \times BaseScore + 0.2 \times RealismScore$）。
- $W_i$：动态权重值，这是控制系统偏好的关键。

#### (1) 动态权重值($W_i$)
为了让所有平台的权重之和必须等于1，系统会将每个平台的价值得分$V_i$除以所有平台价值得分的总和$\sum V_i$，从而得到最终的分配权重。
\[
W_i = \frac{V_i}{\sum_{j=1}^{n} V_j}
\]

#### (2) 平台综合价值($V_i$)
- 核心公式：
\[
V_p = 0.4 \times C_1 + 0.3 \times C_2 + 0.3 \times C_3
\]

| 系数 | 指标 | 说明 |
| :--- | :--- | :--- |
| $C_1$ | 指标丰富度系数 | $\frac{\text{平均每个视频的有效指标数}}{\text{该平台支持的最大指标数}}$ |
| $C_2$ | 数据有效性系数 | $\frac{\text{该平台有效视频数}}{\text{该平台平台视频总数}}$ |
| $C_3$ | 互动质量系数 | $\frac{\text{该平台所有视频互动率的平均值}}{\text{所有平台中的最大平均互动率}}$ |

---

## 二、接口安全性设计
### 身份验证
- **RS256 非对称加密**：JWT签名算法为RS256，使用私钥签名、公钥验签，彻底防止密钥泄露导致的Token伪造就算抓包拿到token，攻击者没有私钥也无法篡改或伪造。
- **Token有效期管理**：设置Token有效期为1天，减少Token被滥用的窗口期。
- **双重身份校验**：全链路实施Token有效性与用户身份的双重校验，拒绝任何伪造的任何用户身份参数。
- **统一签发体系**：业务Token和刷新Token服务端均采用相同的JWT-RS验签机制，确保安全策略的一致性。
- **统一状态校验**：基于`localToken`/`tokens`表存储，配合服务端中间件`AuthMiddleware`实现严格的状态校验。
- **Token个数限制**：新增`valid_tokens`表存储有效Token，超过限制时自动淘汰最早的Token，防止无限生成Token。
- **主动失效机制**：支持通过退出登录、密码重置等操作主动失效Token，提升账户安全性。

### 多层校验
1.  **第一层校验**：校验Token签名有效性（是否被篡改/过期），确保Token为当前用户所有且未被主动失效。
2.  **第二层校验**：校验Token是否在白名单中（`valid_tokens`表），是否过期。
3.  **第三层校验**：校验Token中的用户ID/用户名，与当前请求查询的资源（如用户信息）所属身份一致，避免越权查询。
4.  **第四层校验**：校验Token颁发时间是否与当前时间间隔在有效期内，确保修改后Token自动失效。

### 密钥管理
- **密钥存储**：私钥(`private.pem`)和公钥(`public.pem`)存储在专用目录，权限严格控制。
- **错误排查**：包含`username`字段，便于后端快速定位身份。
- **前端集成**：前端的错误日志记录，包括Token验证失败的具体原因。
- **错误处理**：统一的错误处理机制，根据后端返回的code和message进行相应处理。
- **Token黑名单**：新增`token_blacklist`表存储已失效的Token，包含`user_id`、`token`、`invalidated_at`字段。
- **Token白名单**：新增`valid_tokens`表存储用户的有效Token，包含`user_id`、`token`、`created_at`字段。

### 核心逻辑（无敏感参数传输，从根源避免泄露）
- **后端**：生成或获取Token -> 校验 -> 校验有效期 -> 提取Payload中的用户ID -> 直接用该ID查询数据，全程不依赖前端传递的身份参数。
- **前端**：解析成功获取数据，校验失败则报错。

### Token生命周期管理
- **Token创建**：用户登录或成功后，生成JWT Token并存储到`valid_tokens`表。
- **Token验证**：每次请求时，先验证Token签名和有效期，再检查Token是否在白名单中。
- **Token数量控制**：每个用户最多有多个Token，第6次登录时自动将最旧的在白名单中黑名单并从白名单删除。
- **Token失效**：用户退出登录时，将当前Token加入黑名单并从白名单删除；密码重置时，失效该用户所有Token。
- **Token过期**：用户Token的有效期为1天，过期后自动失效，无需额外清理。

### 安全加固措施
- **参数去敏感化**：登录服务器持有私钥(Private Key)签发Token，资源服务器持有公钥(Public Key)验证Token，权限边界清晰。
- **密钥分离管理**：API接口全程移除`user`中的`username`等敏感参数，直接从解密后的Token载荷(Payload)中获取用户身份，权限越权访问漏洞。
- **内部调用鉴权**：微服务间调用（如代理服务调用数据库服务）自动转发`User Token`，确保全链路操作审计可过滤。

---

## 三、数据库设计
### 1. 设计说明
- **用户隔离**：所有业务表均通过`user_id`关联`users.username`，确保数据按用户隔离，符合“用户只能访问自己数据”的业务逻辑。
- **防重防错**：通过`user_id + 平台ID`部分唯一索引，避免同一用户重复爬取的非规整数据。
- **兼容性**：数值型字段（如播放数、点赞数）部分设计为`VARCHAR`，兼容平台返回的纯数字或带格式（如“10w+”）。
- **性能优化**：高查询字段（如`user_id`、`title`）添加索引，加速分页和关键词搜索。

### 2. 数据库总览
| 数据库名 | 用途 | 核心表 |
| :--- | :--- | :--- |
| `login_demo` | 用户认证（登录/注册） | `users` |
| `api_calls` | 调用统计/用户设置 | `api_calls`, `user_settings` |
| `data_demo` | 多平台视频数据存储 | `video_bili_data`, `video_douyin_data`, `video_kuaishou_data`, `video_xiaohongshu_data` |
| `cookie_list` | Cookie池管理 | `cookie_pool` |

### 3. 详细表结构设计
#### 数据库：`login_demo`
**表名：`users` (用户表)**
| 字段名 | 类型 | 约束/默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | `PRIMARY KEY, AUTO_INCREMENT` | 自增主键 |
| `username` | `VARCHAR(50)` | `NOT NULL, UNIQUE` | 用户名（唯一） |
| `password` | `VARCHAR(32)` | `NOT NULL` | 加密密码（MD5盐值+明文） |
| `salt` | `VARCHAR(20)` | `NOT NULL` | 密码盐 |
| `email` | `VARCHAR(100)` | `UNIQUE` | 用户邮箱（唯一） |
| `create_time` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | 用户创建时间 |
| `last_password_reset` | `VARCHAR(100)` | `NULL` | 上次密码重置时间（支持密码重置追踪） |

**索引**：`username`, `email`（登录/注册时的查询）

---

**表名：`user_settings` (用户设置表)**
| 字段名 | 类型 | 约束/默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | `PRIMARY KEY, AUTO_INCREMENT` | 自增主键 |
| `user_id` | `VARCHAR(50)` | `NOT NULL, FOREIGN KEY REFERENCES users(username)` | 关联`users.username` |
| `updated_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | 最后更新时间 |
| `settings` | `TEXT` | `NOT NULL` | 用户设置（JSON字符串） |

---

**表名：`valid_tokens` (Token白名单表)**
| 字段名 | 类型 | 约束/默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | `PRIMARY KEY, AUTO_INCREMENT` | 自增主键 |
| `user_id` | `VARCHAR(50)` | `NOT NULL, FOREIGN KEY REFERENCES users(id)` | 关联的`users`表的`id` |
| `token` | `VARCHAR(600)` | `NOT NULL` | 有效的JWT Token字符串 |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Token创建时间（用户登录/刷新Token时生成） |

---

**表名：`token_blacklist` (Token黑名单表)**
| 字段名 | 类型 | 约束/默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | `PRIMARY KEY, AUTO_INCREMENT` | 自增主键 |
| `user_id` | `VARCHAR(50)` | `NOT NULL, FOREIGN KEY REFERENCES users(id)` | 关联的`users`表的`id` |
| `token` | `VARCHAR(600)` | `NOT NULL` | 失效的JWT Token（用户退出登录/密码重置时生成） |
| `invalidated_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Token失效时间 |

---

#### 数据库：`data_demo`
**主表：`video_bili_data` (B站视频数据表)**
| 字段名 | 类型 | 约束/默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | `PRIMARY KEY, AUTO_INCREMENT` | 自增主键 |
| `user_id` | `VARCHAR(50)` | `NOT NULL` | 关联`users.username` |
| `vid` | `VARCHAR(50)` | `NOT NULL` | 哔哩视频ID |
| `title` | `VARCHAR(255)` | `NOT NULL` | 视频标题 |
| `url` | `VARCHAR(255)` | `NOT NULL` | 视频链接URL |
| `desc` | `TEXT` | | 视频描述 |
| `category` | `VARCHAR(50)` | | 视频分类 |
| `max_qd` | `VARCHAR(50)` | | 最高清晰度 |
| `owner_name` | `VARCHAR(50)` | `DEFAULT 0` | 作者名称 |
| `owner_mid` | `BIGINT` | `DEFAULT 0` | 作者ID |
| `c_time` | `DATE` | | 视频发布日期 |
| `favorite` | `INT` | `DEFAULT 0` | 收藏数 |
| `recommend` | `INT` | `DEFAULT 0` | 推荐数 |
| `comment` | `INT` | `DEFAULT 0` | 评论数 |
| `share` | `INT` | `DEFAULT 0` | 分享数 |
| `like` | `INT` | `DEFAULT 0` | 点赞数 |
| `play` | `INT` | `DEFAULT 0` | 播放数 |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | 数据入库时间 |
| （联合唯一） | | `UNIQUE(user_id, vid)` | 防止同一用户重复存储同视频 |

**索引**：`user_id`, `title`（加速用户维度查询和关键词搜索）

---

**表：`video_douyin_data` (抖音视频数据表)**
| 字段名 | 类型 | 约束/默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | `PRIMARY KEY, AUTO_INCREMENT` | 自增主键 |
| `user_id` | `VARCHAR(50)` | `NOT NULL` | 关联`users.username` |
| `vid` | `VARCHAR(50)` | `NOT NULL` | 抖音视频ID |
| `title` | `VARCHAR(255)` | `NOT NULL` | 视频标题 |
| `url` | `VARCHAR(255)` | `NOT NULL` | 视频链接URL |
| `desc` | `TEXT` | | 视频描述 |
| `max_qd` | `VARCHAR(50)` | | 最高清晰度 |
| `owner_name` | `VARCHAR(50)` | `DEFAULT 0` | 作者名称 |
| `owner_id` | `BIGINT` | `DEFAULT 0` | 作者ID |
| `c_time` | `DATE` | | 视频发布日期 |
| `favorite` | `INT` | `DEFAULT 0` | 收藏数 |
| `comment` | `INT` | `DEFAULT 0` | 评论数 |
| `share` | `INT` | `DEFAULT 0` | 分享数 |
| `like` | `INT` | `DEFAULT 0` | 点赞数 |
| `play` | `INT` | `DEFAULT 0` | 播放数 |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | 数据入库时间 |
| （联合唯一） | | `UNIQUE(user_id, vid)` | 防止同一用户重复存储同视频 |

---

**表：`video_kuaishou_data` (快手视频数据表)**
| 字段名 | 类型 | 约束/默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | `PRIMARY KEY, AUTO_INCREMENT` | 自增主键 |
| `user_id` | `VARCHAR(50)` | `NOT NULL` | 关联`users.username` |
| `vid` | `VARCHAR(50)` | `NOT NULL` | 快手视频ID |
| `title` | `VARCHAR(255)` | `NOT NULL` | 视频标题 |
| `url` | `VARCHAR(255)` | `NOT NULL` | 视频链接URL |
| `desc` | `TEXT` | | 视频描述 |
| `owner_name` | `VARCHAR(50)` | `DEFAULT 0` | 作者名称 |
| `owner_id` | `VARCHAR(100)` | `DEFAULT 0` | 作者ID |
| `duration` | `VARCHAR(50)` | | 视频时长 |
| `play_count` | `VARCHAR(50)` | `DEFAULT 0` | 播放数 |
| `like_count` | `VARCHAR(50)` | `DEFAULT 0` | 点赞数 |
| `comment_count` | `VARCHAR(50)` | `DEFAULT 0` | 评论数 |
| `share_count` | `VARCHAR(50)` | `DEFAULT 0` | 分享数 |
| `publish_time` | `DATETIME` | | 视频发布时间 |
| `images` | `TEXT` | | 视频帧（JSON字符串） |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | 数据入库时间 |
| （联合唯一） | | `UNIQUE(user_id, vid)` | 防止同一用户重复存储同视频 |

---

**表：`video_xiaohongshu_data` (小红书视频数据表)**
| 字段名 | 类型 | 约束/默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | `PRIMARY KEY, AUTO_INCREMENT` | 自增主键 |
| `user_id` | `VARCHAR(50)` | `NOT NULL` | 关联`users.username` |
| `vid` | `VARCHAR(50)` | `NOT NULL` | 小红书视频ID |
| `title` | `VARCHAR(255)` | `NOT NULL` | 视频标题 |
| `url` | `VARCHAR(255)` | `NOT NULL` | 视频链接URL |
| `desc` | `TEXT` | | 视频描述 |
| `owner_name` | `VARCHAR(50)` | `DEFAULT 0` | 作者名称 |
| `owner_id` | `VARCHAR(100)` | `DEFAULT 0` | 作者ID |
| `duration` | `VARCHAR(50)` | | 视频时长 |
| `like_count` | `VARCHAR(50)` | `DEFAULT 0` | 点赞数 |
| `comment_count` | `VARCHAR(50)` | `DEFAULT 0` | 评论数 |
| `share_count` | `VARCHAR(50)` | `DEFAULT 0` | 分享数 |
| `publish_time` | `DATETIME` | | 视频发布时间 |
| `images` | `TEXT` | | 视频帧（JSON字符串） |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | 数据入库时间 |
| （联合唯一） | | `UNIQUE(user_id, vid)` | 防止同一用户重复存储同视频 |

---

## 四、全栈后端API接口规格清单与技术清单
系统提供完整的全栈后端API接口，支持跨平台视频解析、数据获取、AI分析等功能，以下是服务器上的详细API配置（已通过Nginx代理统一管理，展示的是路由路径）

| 所属模块 | 核心文件 | 实际端口 | 接口路由（Route） | 方法 | 功能描述 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **用户鉴权中心** | `server.js` | 9100 | `/api/register` | `POST` | 用户注册（含密码MD5加盐存储） |
| | | | `/api/login` | `POST` | 用户登录并下发JWT Token |
| | | | `/api/sendCode` | `POST` | 发送注册邮箱验证码（关联Nodemailer） |
| | | | `/api/resetCode` | `POST` | 发送重置邮箱验证码 |
| | | | `/api/resetPassword` | `POST` | 校验验证码并重置密码 |
| | | | `/api/userInfo` | `GET` | 获取当前用户信息（需要JWT Token） |
| | | | `/api/changePassword` | `POST` | 用户修改密码 |
| | | | `/api/forgotPassword` | `POST` | 用户重置密码 |
| | | | `/api/user/setPassword` | `POST` | 用户设置密码 |
| | | | `/api/user/forgotPassword` | `POST` | 用户重置密码 |
| **数据采集引擎** | `bilis.js` | 7003 | `/api/ac/bili/video` | `GET` | B站视频信息获取（含WBI签名逆向） |
| | | | `/api/4c/bili/bvid` | `GET` | B站视频基础信息获取（含WBI签名逆向） |
| | | | `/api/4c/bili/avid` | `GET` | B站视频CID查询 |
| | | | `/api/4c/bili/cid` | `GET` | B站视频CID查询 |
| | | | `/api/4c/bili/dmvideo` | `GET` | B站视频弹幕数据获取 |
| | | | `/api/4c/bili/bvidvideo` | `GET` | B站视频数据合并（基础信息+播放地址） |
| | | | `/api/4c/bili/rankvideo` | `GET` | B站视频分区与排行榜数据获取 |
| | | | `/api/4c/bili/comment/all` | `GET` | B站视频评论区内容深度爬取 |
| | `douyin_video.py` | 7001 | `/api/ac/douyin/video` | `POST` | 抖音视频/图文解析（Playwright驱动） |
| | | | `/api/4c/douyin/cover/stream` | `GET` | 抖音封面流获取 |
| | `kuaishou_video.py` | 7004 | `/api/ac/kuaishou/video` | `POST` | 快手视频解析 |
| | | | `/api/4c/kuaishou/comment` | `GET` | 快手视频评论解析 |
| | `xiaohongshu.py` | 7002 | `/api/ac/xiaohongshu/video` | `POST` | 小红书视频解析 |
| **AI智能中转** | `ai.js` | 6015 | `/api/ac/chat` | `POST` | DeepSeek SSE流式接口 |
| | | | `/api/4c/aimin` | `POST` | 针对视频标题的创作分析接口 |
| **数据写入** | | | `/api/ac/bili/video` | `POST` | B站视频数据写入数据库 |
| | | | `/api/4c/douyin/video` | `POST` | 抖音视频数据写入数据库 |
| | | | `/api/4c/kuaishou/video` | `POST` | 快手视频数据写入数据库 |
| | | | `/api/4c/xiaohongshu/video` | `POST` | 小红书视频数据写入数据库 |
| **数据查询** | | | `/api/ac/bili/video` | `GET` | B站视频数据查询 |
| | | | `/api/4c/douyin/video` | `GET` | 抖音视频数据查询 |
| | | | `/api/4c/kuaishou/video` | `GET` | 快手视频数据查询 |
| | | | `/api/4c/xiaohongshu/video` | `GET` | 小红书视频数据查询 |
| **数据管理服务** | `cookie.js` | 7010 | `/api/ac/count` | `GET` | 获取所有已写入数据统计 |
| | | | `/api/4c/call` | `GET` | 获取用户的API调用统计 |
| | | | `/api/cookie/valid` | `GET` | 获取有效的B站Cookie池（检测、过滤、健康状态） |
| | | | `/api/cookie/invalid` | `POST` | 标记失效的Cookie到Cookie池 |
| | | | `/api/cookie/validate` | `POST` | 批量校验Cookie池有效性 |
| | | | `/api/user/settings` | `GET` | 获取用户设置 |
| | | | `/api/user/settings` | `POST` | 更新用户设置 |
| **媒体代理服务** | `image-proxy.js` | 7021 | `/api/proxy/image` | `GET` | 绕过B站防盗链，显示视频封面 |

### 前端技术栈
| 前端技术 | 说明 | 版本 |
| :--- | :--- | :--- |
| HTML5 | 页面基础 | ES6+ |
| CSS3 | 样式 | ES6+ |
| JavaScript (Vanilla JS) | 核心业务逻辑 | ES6+ |
| Tailwind CSS | UI框架，快速构建UI | v3.0+ |
| Charts | 数据可视化图表 | v4.0+ |
| 其他 | 数据格式化库 | v1.0+ |

### 后端技术栈
| 后端技术 | 用途 | 版本 |
| :--- | :--- | :--- |
| JavaScript (Node.js) | Web应用运行环境 | v16+ |
| Express | Web应用框架 | v4.18+ |
| Python | 动态脚本解析与数据处理 | v3.8+ |
| Playwright | 无头浏览器，网页渲染 | v1.20+ |
| Flask | Python Web框架 | v2.0+ |
| MySQL | 关系型数据库 | v8.0+ |
| Nginx | 反向代理，负载均衡 | v1.18+ |
| Sharp | 图像处理工具 | v0.30+ |
| Axios | HTTP客户端 | v1.0+ |
| Node-fetch | Node.js HTTP客户端 | v3.0+ |
| JWT | 用户认证与授权 | v6.0+ |
| DeepSeek 大模型 | 智能数据分析与建议生成 | 最新 |

---

## 五、AI流式输出（SSE）与Prompt工程化约束
### 1. Prompt工程设计特点
在AI对话体系中，Prompt工程围绕“结构化、约束性、人性化”三大核心特征，确保平台生成的分析场景（标题、关键词、标签）均能在平台、用户、审核的多方约束下，输出用户友好、合规的高质量结果。

#### （1）平台级 Prompt 设计
| 平台 | 定义 | 作用 | 输出结构 |
| :--- | :--- | :--- | :--- |
| 抖音平台 Prompt | 适配抖音平台的调性、用户偏好与审核标准 | 帮助内容快速破圈 | 输出内容：垂直分析、数据指标、优化方向（字数不超过2行） |
| 快手平台 Prompt | 适配快手平台的调性、用户偏好与审核标准 | 优化内容与算法推荐的匹配度 | 输出内容：垂直分析、数据指标、优化方向（字数不超过2行） |
| 小红书平台 Prompt | 适配小红书平台的调性、用户偏好与审核标准 | 优化内容与算法推荐的匹配度 | 输出内容：垂直分析、数据指标、优化方向（字数不超过2行） |
| B站平台 Prompt | 适配B站平台的调性、用户偏好与审核标准 | 优化内容与算法推荐的匹配度 | 输出内容：垂直分析、数据指标、优化方向（字数不超过2行） |

#### （2）约束规则 Prompt
- **合规性**：防止输出违法、违规内容
- **可读性**：禁止大段文字，每个模块3条，数据必须规范；标题用【】标注
- **格式**：统一的输出结构，适配AI输出的结构化内容，核心规范如下：

### 2. 流式（SSE）输出与优化
#### （1）流式输出特点
- **低延迟**：Server-Sent Events(SSE)流式输出特点是持续传输，无需等待AI生成全部内容，就能将结果实时推送给用户。
- **渐进式体验**：用户无需等待AI一次性生成完成，就可以看到“实时生成”的内容。
- **高并发处理**：SSE连接为长连接，支持用户并发请求，服务器压力可控。
- **低带宽占用**：数据分段传输，减少单次传输数据量，优化用户体验。

#### （2）核心指标优化
- **首字响应时间（TTFT）**：优化AI的缓存与推理链路，降低首字响应时间。
- **响应流率**：持续输出，保证用户看到的内容是实时的，同时又能降低“实时生成”的卡顿感，保证实时性与性能的平衡。

---

## 补充说明
以上为项目核心设计文档的Markdown整理版，涵盖了算法、安全、数据库、接口、AI交互等核心模块的完整设计。

需要我把这份文档按模块拆分成多个独立文件（比如`algorithm.md`、`security.md`、`database.md`、`api.md`），方便你后续管理和复用吗？
