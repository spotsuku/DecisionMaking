"use client";

import { useState } from "react";

const evidence = [
  { n:"01", insight:"先延ばしは、感情の問題である", detail:"人は時間がないからではなく、考えると生じる不快感を避けるために先延ばしする。", source:"Sirois & Pychyl", href:"https://core.ac.uk/download/pdf/42613080.pdf" },
  { n:"02", insight:"何もしないことも、ひとつの決断である", detail:"保留・現状維持・他者待ちは、決断しなかった結果への責任を感じにくくする。", source:"Anderson", href:"https://pubmed.ncbi.nlm.nih.gov/12555797/" },
  { n:"03", insight:"選択肢を残すほど、決断は遠のく", detail:"可能性を残そうとして複数案を走らせると、資源が分散し、比較と学習が進まない。", source:"Shin & Ariely", href:"https://web.mit.edu/ariely/www/MIT/Papers/doors.pdf" },
  { n:"04", insight:"情報が増えても、判断基準がなければ決まらない", detail:"比較が難しいほど、人は選ばないという選択を取りやすくなる。", source:"Dhar", href:"https://academic.oup.com/jcr/article/24/2/215/1797961" },
];

const questions = [
  { label:"QUESTION 01", title:"今決められない悩みはありますか？", answers:["思い浮かんだら次へ"] },
  { label:"QUESTION 02", title:"何が分かれば、決められますか？", answers:["必要な情報が明確","判断基準が曖昧","結果が怖い","誰かの承認を待っている"] },
  { label:"QUESTION 03", title:"決めたら、24時間以内に何をしますか？", answers:["連絡する","質問する","会議を決める","断る・辞める"] },
];

export default function Home() {
  const [started,setStarted]=useState(false);
  const [question,setQuestion]=useState(0);
  const [answers,setAnswers]=useState<string[]>([]);
  const scrollToDemo=()=>document.getElementById("demo")?.scrollIntoView({behavior:"smooth"});
  const choose=(answer:string)=>{setAnswers(current=>[...current,answer]);if(question<questions.length-1)setQuestion(current=>current+1)};
  const reset=()=>{setStarted(false);setQuestion(0);setAnswers([])};

  return <main>
    <header className="nav"><a href="#top" className="brand">DECISION MAKING</a><button className="navCta" onClick={scrollToDemo}>無料で試す <span>↗</span></button></header>

    <section id="top" className="hero">
      <div className="heroGrid" aria-hidden="true"/>
      <div className="heroCopy">
        <p className="eyebrow">DECISION MAKING APP</p>
        <h1>決めろ。</h1>
        <p className="heroDescription">問い・判断基準・選択肢を整理し、<strong>24時間以内の最初の行動</strong>まで決める。自分の人生と仕事を、自分で前に進めるための意思決定アプリです。</p>
        <button className="primary" onClick={scrollToDemo}>無料で意思決定してみる <span>→</span></button>
        <p className="microcopy">毎月3件まで無料・カード不要</p>
      </div>
      <div className="phoneWrap"><div className="phoneIntro"><span>決断力を高めるアプリ</span><strong>Decision Making</strong></div><div className="phoneMock" aria-label="Decision Making アプリ画面モック"><i className="sideButton sideButtonTop"/><i className="sideButton sideButtonBottom"/><div className="phoneScreen"><div className="deviceStatus"><span>9:41</span><i>● ●●●</i></div><div className="phoneNotch"/><div className="phoneStatus"><b>DECISION MAKING</b><span>2 / 5</span></div><div className="mockProgress"><i><b/></i></div><p className="mockLabel">JUDGMENT CRITERIA</p><strong>今回の決断で、<br/>最も守りたいものは？</strong><div className="mockAnswers"><span>成長の可能性 <b>→</b></span><span>生活の安定 <b>→</b></span><span>仲間との信頼 <b>→</b></span></div><small>正解ではなく、あなたの判断基準を明確にします。</small><i className="homeIndicator"/></div></div></div>
    </section>

    <section className="quoteFeature" aria-labelledby="zuckerberg-quote">
      <figure className="quotePortrait">
        <img src="https://commons.wikimedia.org/wiki/Special:Redirect/file/Mark_Zuckerberg_2019_%28cropped%29.jpg?width=1200" alt="Facebook F8 2019で登壇するマーク・ザッカーバーグ"/>
        <figcaption><strong>MARK ZUCKERBERG</strong><span>FACEBOOK FOUNDER</span><a href="https://commons.wikimedia.org/wiki/File:Mark_Zuckerberg_2019_(cropped).jpg" target="_blank" rel="noreferrer">PHOTO: ANTHONY QUINTANO / CC BY 2.0 ↗</a></figcaption>
      </figure>
      <div className="quoteCopy">
        <p className="sectionNo">FACEBOOK&apos;S EARLY MOTTO</p>
        <blockquote id="zuckerberg-quote"><span>Done is better<br/>than perfect.</span><strong>完璧を目指すより、<br/>まず終わらせろ。</strong></blockquote>
      </div>
    </section>

    <section className="benefits section"><p className="sectionNo">01 — BENEFITS</p><h2>答えをもらうのではなく、<br/>自分で決められるようになる。</h2><div className="benefitGrid">
      <article><span>01</span><h3>迷いの正体が分かる</h3><p>情報不足なのか、判断基準がないのか、結果を恐れているのか。決められない理由を分解します。</p></article>
      <article><span>02</span><h3>決断が言葉に残る</h3><p>選んだ理由、捨てた選択肢、想定した結果を記録。後から説明をすり替えられない決断をつくります。</p></article>
      <article><span>03</span><h3>行動と学習につながる</h3><p>決断を最小の行動へ変換。結果が悪くても、予測とのズレから次の判断基準を更新できます。</p></article>
    </div></section>

    <section className="features section"><p className="sectionNo red">02 — HOW IT WORKS</p><div className="sectionHeading"><h2>一問ずつ、<br/>決断を前に進める。</h2><p>長い相談文は必要ありません。今の状態に合わせて、次に考えるべき問いだけを出します。</p></div><div className="steps">
      <article><b>01</b><strong>問いを定める</strong><p>何を、誰が、いつまでに決めるかを一文にする。</p></article>
      <article><b>02</b><strong>決められない理由を診断</strong><p>情報・基準・権限・感情・実行のどこで止まっているかを見つける。</p></article>
      <article><b>03</b><strong>決断を確定する</strong><p>選択、理由、予測、受け入れる損失をDecision Cardに残す。</p></article>
      <article><b>04</b><strong>行動し、振り返る</strong><p>24時間以内の一歩を決め、結果と予測のズレから学ぶ。</p></article>
    </div><div className="decisionCard"><div className="cardTop"><span>DECISION CARD</span><b>COMMITTED</b></div><h3>A案に集中する。</h3><dl><div><dt>判断基準</dt><dd>3か月で顧客理解を深められるか</dd></div><div><dt>受け入れること</dt><dd>B案の短期売上を手放す</dd></div><div><dt>最初の行動</dt><dd>今日17時までにチームへ方針を伝える</dd></div></dl></div></section>

    <section className="learning section"><p className="sectionNo">03 — LEARNING</p><h2>決めたフリは、<br/>成長を完全に止める。</h2><p className="learningLead">曖昧なまま進めると、良い結果だけを自分のものにし、悪い結果を外部環境のせいにできます。アプリは決断前の予測を残し、結果とのズレを同じ物差しで振り返ります。</p><div className="compare"><div><span>これまで</span><strong>上手くいかなければ、説明を変える。</strong><p>何を決めたかが曖昧なため、失敗も学びも残らない。</p></div><div><span>Decision Making</span><strong>結果を受け入れ、判断基準を更新する。</strong><p>悪い結果とのズレが、次の決断を良くする材料になる。</p></div></div></section>

    <section className="science section"><p className="sectionNo red">04 — EVIDENCE</p><div className="sectionHeading"><h2>なぜ、人は<br/>決められないのか。</h2><p>一般論を並べるのではなく、先延ばし・不作為・選択回避・判断基準に関する研究を、アプリ内の問いと判定ルールへ反映しています。</p></div><div className="evidenceGrid">{evidence.map(item=><a href={item.href} target="_blank" rel="noreferrer" key={item.n}><span>{item.n}</span><h3>{item.insight}</h3><p>{item.detail}</p><footer>{item.source}<b>↗</b></footer></a>)}</div><p className="evidenceNote">研究は診断の根拠として利用し、人格や心理状態を断定するものではありません。</p></section>

    <section className="quoteFeature jobsFeature" aria-labelledby="jobs-quote"><figure className="quotePortrait"><img src="https://commons.wikimedia.org/wiki/Special:Redirect/file/Steve_Jobs_Headshot_2010-CROP2.jpg?width=1200" alt="スティーブ・ジョブズ"/><figcaption><strong>STEVE JOBS</strong><span>APPLE CO-FOUNDER</span><a href="https://commons.wikimedia.org/wiki/File:Steve_Jobs_Headshot_2010-CROP2.jpg" target="_blank" rel="noreferrer">PHOTO: MATTHEW YOHE / CC BY-SA 3.0 ↗</a></figcaption></figure><div className="quoteCopy"><p className="sectionNo">STANFORD COMMENCEMENT, 2005</p><blockquote id="jobs-quote"><span>Have the courage<br/>to follow your heart<br/>and intuition.</span><strong>自分の心と直感に従う<br/>勇気を持ちなさい。</strong></blockquote></div></section>

    <section id="demo" className="demo section">{!started?<div className="demoIntro"><p className="sectionNo red">05 — TRY THE APP</p><h2>3つの質問で、<br/>使い心地を試す。</h2><p>いま抱えている意思決定をひとつ思い浮かべてください。答えを出すのではなく、何が決断を止めているかを整理します。</p><button className="primary" onClick={()=>setStarted(true)}>意思決定してみる <span>→</span></button></div>:answers.length<questions.length?<div className="questionPanel"><div className="trialProgress"><span>0{question+1}</span><i><b style={{width:`${((question+1)/questions.length)*100}%`}}/></i><small>0{questions.length}</small></div><p className="sectionNo red">{questions[question].label}</p><h2>{questions[question].title}</h2><div className="answerGrid">{questions[question].answers.map(answer=><button onClick={()=>choose(answer)} key={answer}>{answer}<span>→</span></button>)}</div></div>:<div className="resultPanel" aria-live="polite"><p className="sectionNo red">YOUR NEXT STEP</p><h2>次は、あなたの判断基準を言葉にします。</h2><p>今回の回答から、最初に整理すべきなのは<strong>「{answers[1]}」</strong>です。製品版では、選択肢の整理、決断の確定、24時間以内の行動まで進みます。</p><button className="primary">無料で続きを始める <span>→</span></button><button className="reset" onClick={reset}>別の意思決定で試す</button></div>}</section>

    <section className="pricing section"><p className="sectionNo">06 — START</p><div className="pricingCopy"><h2><span>自分の人生と仕事を、</span><span>自分で決めて</span><span>進め。</span></h2><p>最初の3件は無料。決断を記録し、行動と振り返りまで試せます。</p></div><div className="priceCard"><span>FREE</span><strong>¥0</strong><ul><li>毎月3件の意思決定</li><li>Decision Card</li><li>最初の行動設定</li><li>結果の振り返り</li></ul><button onClick={scrollToDemo}>無料で始める <b>→</b></button></div></section>
    <footer className="footer"><strong>DECISION MAKING</strong><span>© 2026 Decision Making</span></footer>
  </main>;
}
