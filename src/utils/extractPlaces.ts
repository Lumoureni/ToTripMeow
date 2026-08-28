const STOP_WORDS = new Set([
  '我们',
  '你们',
  '他们',
  '可以',
  '建议',
  '然后',
  '接着',
  '随后',
  '之后',
  '上午',
  '下午',
  '晚上',
  '中午',
  '早上',
  '傍晚',
  '今天',
  '明天',
  '自由',
  '活动',
  '行程',
  '时间',
  '小时',
  '分钟',
  '左右',
  '附近',
  '周边',
  '打卡',
  '美食',
  '酒店',
  '住宿',
  '交通',
  '出发',
  '返回',
  '结束',
  '开始',
  '一日游',
  '两日游',
  '跟团',
  '自驾',
  '推荐',
  '必去',
  '值得',
  '非常',
  '特别',
  '很多',
  '一点',
  '一些',
])

const PLACE_SUFFIX =
  '(?:省|市|自治区|地区|盟|州|区|县|旗|镇|乡|街道|路|街|巷|大道|景区|风景区|度假区|公园|动物园|植物园|寺|庙|塔|祠|宫|观|山|峰|岭|湖|池|海|岛|湾|江|河|溪|峡谷|洞|岩|广场|机场|火车站|高铁站|汽车站|客运站|码头|港口|博物馆|纪念馆|展览馆|美术馆|大学|古城|古镇|老街|步行街|夜市|商圈|湿地|草原|沙漠|森林|温泉)'

const PLACE_SUFFIX_RE = new RegExp(`${PLACE_SUFFIX}$`)

const EMBEDDED_PLACE = new RegExp(`([\\u4e00-\\u9fff]{2,10}${PLACE_SUFFIX})`, 'g')

const TIME_OR_DAY_PREFIX =
  /^(?:第?[一二三四五六七八九十\d]+天|周[一二三四五六日天]|早上|上午|中午|下午|晚上|傍晚|凌晨|清晨|夜里|今晚|今天|明天|后天)+/

const ACTION_PREFIX =
  /^(?:前往|路过|顺带|顺便|可以|建议|玩|看|游|逛|住|吃|喝|飞|乘|坐|的|在|去|到|往|从|与|和|及|再)+/

function tightenPlace(s: string): string {
  if (!/(?:省|市|州|区|县|旗|镇)$/.test(s) || s.length <= 4) return s
  const two = s.slice(-3)
  if (/^[\u4e00-\u9fff]{2}(?:省|市|州|区|县|旗|镇)$/.test(two)) return two
  const three = s.slice(-4)
  if (/^[\u4e00-\u9fff]{3}(?:省|市|州|区|县|旗|镇)$/.test(three)) return three
  return s
}

function normalizeCandidate(raw: string): string | null {
  let s = raw
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/^[\d\s.、．·•]+/, '')
    .replace(TIME_OR_DAY_PREFIX, '')
    .replace(ACTION_PREFIX, '')
    .replace(/出发|回来|返回/g, '')
    .replace(/(?:抵达|到达)$/g, '')
    .replace(/[的了呢吧啊哦呀嘛啦咯呗～~！!？?。.…]+$/g, '')
    .replace(/\s+/g, '')
    .trim()

  s = s.replace(TIME_OR_DAY_PREFIX, '').replace(ACTION_PREFIX, '').trim()
  // 循环剥离残留动词前缀（避免「往苏州」这类半截前缀）
  for (let i = 0; i < 3; i += 1) {
    const next = s.replace(ACTION_PREFIX, '').trim()
    if (next === s) break
    s = next
  }
  s = tightenPlace(s)

  if (s.length < 2 || s.length > 20) return null
  if (STOP_WORDS.has(s)) return null
  if (/^(往|去|到|从|和|与|及)/.test(s)) return null
  if (/^\d+$/.test(s)) return null
  if (!/[\u4e00-\u9fff]/.test(s)) return null

  const looksLikePlace = PLACE_SUFFIX_RE.test(s) || /^[\u4e00-\u9fff]{2,12}$/.test(s)
  if (!looksLikePlace) return null
  return s
}

/** 从粘贴的行程/攻略文本中抽取地点候选词 */
export function extractPlaceCandidates(text: string): string[] {
  const source = text.trim()
  if (!source) return []

  const ordered: string[] = []
  const seen = new Set<string>()

  const add = (raw: string) => {
    const s = normalizeCandidate(raw)
    if (!s || seen.has(s)) return
    seen.add(s)
    ordered.push(s)
  }

  for (const match of source.matchAll(EMBEDDED_PLACE)) {
    add(match[1] || match[0])
  }

  const parts = source.split(
    /[\n\r]+|[,，。；;、！!？?|/｜]|[-–—~～→➡➞＞>]|前往|途径|途经|经过|抵达|到达|再去|然后去|接着去|随后|以及|和|第[一二三四五六七八九十\d]+天|[Dd]ay\s*\d+[:：]?/g,
  )

  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.length >= 2 && trimmed.length <= 18) add(trimmed)
  }

  // 去掉被更长地名包含的短词；若短词带后缀、长词只是多了噪声，保留短词
  const filtered = ordered.filter((c) => {
    const longer = ordered.find((other) => other !== c && other.includes(c))
    if (!longer) return true
    // 「西湖」被「杭州西湖」包含时保留两者中更完整的带后缀词即可，去掉更短的
    return !(longer.length <= c.length + 4 && PLACE_SUFFIX_RE.test(longer))
  })

  return filtered.slice(0, 12)
}
