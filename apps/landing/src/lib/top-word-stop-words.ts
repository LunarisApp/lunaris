function stopWords(words: string) {
	return new Set(words.trim().split(/\s+/u));
}

export const topWordStopWords = {
	de_DE: stopWords(`
		aber als also am an auch auf aus bei bis da das dass dem den der des
		dich die dies diese diesem diesen dieser dieses doch du durch ein eine
		einem einen einer eines er es für gegen gehabt haben hat hatte hatte
		hier hinter ich ihm ihn ihnen ihr ihre im in ins ist ja jede jedem jeden
		jeder jedes kann könnte man mein meine mit muss nach neben ob oder ohne
		sein seine seit sich sie sind so über um und unser unsere unter vom von
		vor war waren was weil welche welchem welchen welcher welches wenn
		wer wie wird würde zu zum zur zwischen
	`),
	en_US: stopWords(`
		a about above across after against along am among an and are around as at
		be because been before being below beneath beside between beyond both but
		by can could despite did do does doing down during each either except for
		from had has have having he he'd he'll he's her hers herself him himself
		his how i i'd i'll i'm i've if in inside into is it it'd it'll it's its
		itself like may me might mine must my myself near
		of off on once onto or other our ours ourselves out outside
		over past per shall she she'd she'll she's should since so some than that
		that's the their theirs there
		them themselves then these they they'd they'll they're they've this those
		though through throughout to toward under underneath unless until up upon
		us via was we we'd we'll we're we've were what when
		where whether which while who whom whose why will with within without
		would you you'd you'll you're you've your yours yourself yourselves
	`),
	es: stopWords(`
		a al algo ante bajo cabe cada como con contra cual cuando de del desde
		donde durante e el ella ellas ello ellos en entre era erais éramos eran
		eras eres es esa esas ese eso esos esta estaba estabais estábamos estaban
		estabas estado estamos están estar estas este esto estos estoy fue fuera
		fuerais fuéramos fueran fueras fueron fui fuimos fuiste fuisteis hacia
		hasta hay la las le les lo los me mediante mi mis nos nosotras nosotros o
		os otra otras otro otros para pero por porque que quien se según ser si
		sido siendo sin sobre sois somos son soy su sus te ti tras tu tus tú un
		una unas uno unos usted ustedes y yo
	`),
	fr: stopWords(`
		à afin ai ainsi as au aux avec avait avons car ce ceci cela ces c'est
		c'était cet cette chez comme d'un d'une dans de des du elle elles en
		entre es est et eu eux étaient étais était étant été êtes faire fait il
		ils j'ai j'avais j'étais je l'un l'une la le les leur
		leurs lui ma mais me mes moi mon nos notre nous on ont ou par parce
		pendant pour près puis qu'elle qu'elles qu'il qu'ils quand que quel
		quelle quelles quels qui sa sans se
		ses si soi son sont sous sur ta te tes toi ton tous tout toute toutes tu
		un une vos votre vous y
	`),
	pt_BR: stopWords(`
		a à ao aos aquela aquelas aquele aqueles aquilo as até com como da das de
		dela delas dele deles depois do dos durante e é ela elas ele eles em entre
		era eram essa essas esse esses esta estava estavam este estes eu foi
		foram fui há isso isto já lhe lhes mais mas me meu meus minha minhas na
		nas nos nós nossa nossas nosso nossos num numa o os ou para pela
		pelas pelo pelos por porque qual quando que quem se sem ser seu seus sob
		sobre sua suas são também te tem tinha tinham tu um uma umas uns você
		vocês
	`),
} as const;
