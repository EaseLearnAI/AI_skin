const jsonInstruction = '只返回严格有效的 JSON，不要使用 Markdown 代码块，不要添加解释文字。';

const productOcrPrompt = () => `${jsonInstruction}\n从产品图片提取产品名称和完整成分数组。输出：{"产品名称":"字符串","产品成分":["成分"]}`;

const ingredientPrompt = ({ productName, ingredients }) => `${jsonInstruction}
你是护肤品成分分析师。产品：${productName}。成分：${ingredients.join('、')}。
必须严格按以下结构和类型输出：
{
  "safetyIndex": 0,
  "efficacyScore": 0,
  "activeIngredients": 0,
  "acneRisk": {"level":"低|中|高","percentage":0},
  "irritationRisk": {"level":"低|中|高","percentage":0},
  "allergyRisk": {"level":"低|中|高","percentage":0},
  "efficacyAnalysis": ["功效说明"],
  "potentialRisks": ["风险说明"],
  "recommendations": ["使用建议"],
  "overallRating": 0,
  "summary": "总结"
}
safetyIndex 和 percentage 为 0-100 数字；efficacyScore 和 overallRating 为 0-5 数字；activeIngredients 是活性成分数量的整数，不是成分数组；三个 level 只能使用中文“低”“中”“高”；efficacyAnalysis、potentialRisks、recommendations 必须是字符串数组。`;

const conflictPrompt = ({ products }) => `${jsonInstruction}
分析以下护肤品的成分搭配冲突：${products.map((p) => `${p.name}: ${p.ingredients.join('、')}`).join('\n')}。
必须严格按以下结构和类型输出；没有内容时使用空数组，不要改成字符串：
{
  "conflicts": [{"components":["成分"],"severity":"高|中|低","description":"说明","effects":["影响"]}],
  "safeCombo": [{"components":["成分或产品"],"description":"说明"}],
  "recommendations": {
    "productPairings": {
      "cannotUseTogether": [{"products":["产品A","产品B"],"reason":"原因"}],
      "canUseTogether": [{"products":["产品A","产品B"],"reason":"原因"}]
    },
    "routines": {"morning":["步骤"],"evening":["步骤"]}
  }
}
severity 只能使用中文“高”“中”“低”；effects、products、morning、evening 必须是字符串数组。`;

const planPrompt = ({ requirement, skinConcerns = [], customRequirements, user = {}, products = [], skinAnalysis }) => `${jsonInstruction}
为用户生成只使用其已有产品的早晚护肤方案。
年龄：${user.age || '未知'}；性别：${user.gender || '未知'}；需求：${requirement || '基础护肤'}；关注：${skinConcerns.join('、') || '无'}；补充：${customRequirements || '无'}。
产品：${products.map((p) => `${p.name}(${p.label || '未分类'})`).join('、')}。
皮肤状态：${skinAnalysis ? `${skinAnalysis.skinType?.type || ''}，健康分 ${skinAnalysis.overallAssessment?.healthScore}` : '暂无分析'}。
输出字段：name、morning/evening([{step,product,reason}])、recommendations、skinAnalysisSummary。`;

const skinPrompt = () => `${jsonInstruction}
基于面部照片提供护肤用途的非诊断性观察。不要声称医学诊断。
输出字段：skinType({type,subtype,basis})、blackheads({exists,severity,distribution})、acne({exists,count,types,activity,distribution})、pores({enlarged,severity,distribution})、otherIssues、overallAssessment({healthScore,summary,recommendations,skinCondition})。
枚举必须使用中文：皮肤类型为油性皮肤/干性皮肤/中性皮肤/混合性皮肤；skinCondition 为优秀/良好/一般/需要改善/需要专业护理。`;

module.exports = { productOcrPrompt, ingredientPrompt, conflictPrompt, planPrompt, skinPrompt };
