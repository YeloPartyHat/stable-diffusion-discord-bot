// Setup, loading libraries and initial config
const fs = require('fs')
const fsPromises = require('fs').promises
const fsExists = require('fs.promises.exists')
var config = fs.existsSync('./config/.env') ? require('dotenv').config({ path:'./config/.env'}).parsed : require('dotenv').config().parsed
if (!config||!config.apiUrl||!config.basePath||!config.channelID||!config.adminID||!config.discordBotKey||!config.pixelLimit||!config.fileWatcher||!config.samplers) { throw('Please re-read the setup instructions at https://github.com/ausbitbank/stable-diffusion-discord-bot , you are missing the required .env configuration file or options') }
const Eris = require("eris")
const Constants = Eris.Constants
const Collection = Eris.Collection
const axios = require('axios')
var parseArgs = require('minimist')
const chokidar = require('chokidar')
const moment = require('moment')
const sharp = require("sharp")
const GIF = require("sharp-gif2")
const Diff = require("diff")
const log = console.log.bind(console)
function debugLog(m){if(config.showDebug){log(m)}}
function time(label){if(config.showDebugPerformance){console.time(label)}}
function timeEnd(label){if(config.showDebugPerformance){console.timeEnd(label)}}
const loop = (times, callback) => {[...Array(times)].forEach((item, i) => callback(i))}
const dJSON = require('dirty-json')
var colors = require('colors')
const debounce = require('debounce')
var jimp = require('jimp')
const FormData = require('form-data')
const io = require("socket.io-client")
const socket = io(config.apiUrl,{reconnect: true})
const ExifReader = require('exifreader')
if(config.nsfwChecksEnabled==="true"){config.nsfwChecksEnabled=true}else{config.nsfwChecksEnabled=false}
var paused=false
var queue = []
var users = []
var payments = []
dbRead()
// Shutdown gracefully
var signals = {'SIGHUP': 1,'SIGINT': 2,'SIGTERM': 15}
Object.keys(signals).forEach((signal)=>{
  process.on(signal, () =>{
    log('Bye! ('+signal+' '+signals[signal]+')')
    process.exit(128+signals[signal])
  })
})

// Setup scheduler, start repeating checks
var schedule = []
var dbScheduleFile='./config/dbSchedule.json' // flat file db for schedule
dbScheduleRead()
var cron = require('node-cron')
// hive payment checks. On startup, every 15 minutes and on a !recharge call
const hive = require('@hiveio/hive-js')
if(config.creditsDisabled==='true'){var creditsDisabled=true}else{var creditsDisabled=false}
if(config.showFilename==='true'){var showFilename=true}else{var showFilename=false}
if(config.showPreviews==='true'){var showPreviews=true}else{var showPreviews=false}
if(config.showRenderSettings==='true'){var showRenderSettings=true}else{var showRenderSettings=false}
if(config.statsAdminOnly==='true'){var statsAdminOnly=true}else{var statsAdminOnly=false}
if(config.deleteAfterPost==='true'){var deleteAfterPost=true}else{var deleteAfterPost=false}
if(config.hivePaymentAddress.length>0 && !creditsDisabled){
  var hiveEndpoints = ['https://rpc.ausbit.dev','https://api.hive.blog','https://api.deathwing.me','https://api.c0ff33a.uk','https://hived.emre.sh','https://hive-api.arcange.eu','https://api.hive.blue','https://techcoderx.com','https://hive-api.3speak.tv','https://rpc.mahdiyari.info']
  shuffle(hiveEndpoints)
  hive.config.set('alternative_api_endpoints',hiveEndpoints)
  var hiveUsd = 0.3
  var lastHiveUsd = hiveUsd
  getPrices()
  cron.schedule('0,15,30,45 * * * *', () => { log('Checking account history every 15 minutes'.grey); checkNewPayments() })
  cron.schedule('0,30 * * * *', () => { log('Updating hive price every 30 minutes'.grey); getPrices() }) // todo only get price when needed to apply credit
  if(config.freeRechargeAmount&&config.freeRechargeAmount>0){cron.schedule('0 */12 * * *', () => { log('Recharging users with no credit every 12 hrs'.bgCyan.bold);freeRecharge() }) }
}
const bot = new Eris.CommandClient(config.discordBotKey, {
  intents: ["guilds", "guildMessages", "messageContent", "directMessages", "guildMessageReactions", "directMessageReactions"],
  description: config.botDescription||"Just a slave to the art, maaan",
  owner: config.botOwner||"ausbitbank",
  prefix: "!",
  reconnect: 'auto',
  compress: true,
  getAllUsers: false,
  maxShards: 'auto'
})
var defaultSize = parseInt(config.defaultSize)||512
var defaultSteps = parseInt(config.defaultSteps)||50
var defaultScale = parseFloat(config.defaultScale)||7.5
var defaultStrength = parseFloat(config.defaultStrength)||0.45
var maxSteps = parseInt(config.maxSteps)||100
var maxIterations = parseInt(config.maxIterations)||10
var defaultMaxDiscordFileSize=parseInt(config.defaultMaxDiscordFileSize)||25000000
var basePath = config.basePath
var invokePath = config.invokePath ? config.invokePath : config.basePath
var maxAnimateImages = 100 // Only will fetch most recent X images for animating
var allGalleryChannels = fs.existsSync('./config/dbGalleryChannels.json') ? JSON.parse(fs.readFileSync('./config/dbGalleryChannels.json', 'utf8')) : {}
var allNSFWChannels = fs.existsSync('./config/dbNSFWChannels.json') ? JSON.parse(fs.readFileSync('./config/dbNSFWChannels.json', 'utf8')) : {}
var nsfwWords=config.nsfwWords?.split(',')||['sex','nude','nudity','nsfw','naked','porn','fuck']
if(config.nsfwWords&&config.nsfwWords===''){nsfwWords=[]}
var rembg=config.rembg||'http://127.0.0.1:5000?url='
var defaultModel=config.defaultModel||'stable-diffusion-1.5'
var currentModel='notInitializedYet'
var defaultModelInpaint=config.defaultModelInpaint||'inpainting'
var defaultInpaintPrompt=config.defaultInpaintPrompt||'amazing'
var defaultInpaintStrength=parseFloat(config.defaultInpaintStrength)||0.75
var models=null
var lora=null
var ti=null
// load samplers from config
var samplers=config.samplers.split(',')
var samplersSlash=[]
samplers.forEach((s)=>{samplersSlash.push({name: s, value: s})})
var defaultSampler=samplers[0]
debugLog('Enabled samplers: '+samplers.join(','))
debugLog('Default sampler:'+defaultSampler)
// load our own font list from config
var fonts = config.fonts ? config.fonts.split(',') : ['Arial','Comic Sans MS','Tahoma','Times New Roman','Verdana','Lucida Console']
var fontsSlashCmd = []
fonts.forEach((f)=>{fontsSlashCmd.push({name: f,value: f})})
var rendering = false
var dialogs = {queue: null} // Track and replace our own messages to reduce spam
var failedToPost=[]
// load text files from txt directory, usable as {filename} in prompts, will return a random line from file
var randoms=[]
var randomsCache=[]
try{ // Do we move txt file folder to config as well ? Does anyone but me even customize this ? lmk
  fs.readdir('txt',(err,files)=>{ 
    if(err){log('Unable to read txt file directory'.bgRed);log(err)}
    files.forEach((file)=>{
      if (file.includes('.txt')){
        var name=file.replace('.txt','')
        randoms.push(name)
        randomsCache.push(fs.readFileSync('txt/'+file,'utf-8').split(/r?\n/))
      }
    })
    debugLog('Enabled randomisers: '+randoms.join(','))
  })
}catch(err){log('Unable to read txt file directory'.bgRed);log(err)}
if(randoms.includes('prompt')){randoms.splice(randoms.indexOf('prompt'),1);randoms.splice(0,0,'prompt')} // Prompt should be interpreted first

// slash command setup - beware discord global limitations on the size/amount of slash command options
var slashCommands = [
  {
    name: 'dream',
    description: 'Create a new image from your prompt',
    options: [
      {type: 3, name: 'prompt', description: 'what would you like to see ?', required: true, min_length: 1, max_length:1500 },
      {type: 4, name: 'width', description: 'width of the image in pixels (250-~1024)', required: false, min_value: 256, max_value: 2048 },
      {type: 4, name: 'height', description: 'height of the image in pixels (250-~1024)', required: false, min_value: 256, max_value: 2048 },
      {type: 4, name: 'steps', description: 'how many steps to render for (10-250)', required: false, min_value: 5, max_value: 250 },
      {type: 4, name: 'seed', description: 'seed (initial noise pattern)', required: false},
      {type: 10, name: 'strength', description: 'how much noise to add to your template image (0.1-0.9)', required: false, min_value:0.01, max_value:0.99},
      {type: 10, name: 'scale', description: 'how important is the prompt (1-30)', required: false, min_value:1, max_value:30},
      {type: 4, name: 'number', description: 'how many would you like (1-10)', required: false, min_value: 1, max_value: 10},
      {type: 5, name: 'seamless', description: 'Seamlessly tiling textures', required: false},
      {type: 3, name: 'sampler', description: 'which sampler to use (default is '+defaultSampler+')', required: false, choices: samplersSlash},
      {type: 11, name: 'attachment', description: 'use template image', required: false},
      {type: 10, name: 'gfpgan_strength', description: 'GFPGan strength (0-1)(low= more face correction, high= more accuracy)', required: false, min_value: 0, max_value: 1},
      {type: 10, name: 'codeformer_strength', description: 'Codeformer strength (0-1)(low= more face correction, high= more accuracy)', required: false, min_value: 0, max_value: 1},
      {type: 3, name: 'upscale_level', description: 'upscale amount', required: false, choices: [{name: 'none', value: '0'},{name: '2x', value: '2'},{name: '4x', value: '4'}]},
      {type: 10, name: 'upscale_strength', description: 'upscale strength (0-1)(smoothing/detail loss)', required: false, min_value: 0, max_value: 1},
      {type: 10, name: 'variation_amount', description: 'how much variation from the original image (0-1)(need seed+not k_euler_a sampler)', required: false, min_value:0.01, max_value:1},
      {type: 3, name: 'with_variations', description: 'Advanced variant control, provide seed(s)+weight eg "seed:weight,seed:weight"', required: false, min_length:4,max_length:100},
      {type: 10, name: 'threshold', description: 'Advanced threshold control (0-10)', required: false, min_value:0, max_value:40},
      {type: 10, name: 'perlin', description: 'Add perlin noise to your image (0-1)', required: false, min_value:0, max_value:1},
      {type: 5, name: 'hires_fix', description: 'High resolution fix (re-renders twice using template)', required: false},
      {type: 3, name: 'model', description: 'Change the model/checkpoint - see /models for more info', required: false,   min_length: 3, max_length:40}
    ],
    cooldown: 500,
    execute: (i) => {
      // get attachments
      if (i.data.resolved && i.data.resolved.attachments && i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))){
        var attachmentOrig=i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))
        var attachment=[{width:attachmentOrig.width,height:attachmentOrig.height,size:attachmentOrig.size,proxy_url:attachmentOrig.proxyUrl,content_type:attachmentOrig.contentType,filename:attachmentOrig.filename,id:attachmentOrig.id}]
      }else{var attachment=[]}
      // below allows for the different data structure in public interactions vs direct messages
      request({cmd:getCmd(prepSlashCmd(i.data.options)),userid:i.member?i.member.id:i.user.id,username:i.member?i.member.user.username:i.user.username,bot:i.member?i.member.user.bot:i.user.bot,channelid:i.channel.id,guildid:i.guildID?i.guildID:undefined,attachments:attachment})
    }
  },
  {
    name: 'random',
    description: 'Show me a random prompt from the library',
    options: [ {type: 3, name: 'prompt', description: 'Add these keywords to a random prompt', required: false} ],
    cooldown: 500,
    execute: (i) => {
      var prompt=i.data.options?i.data.options[0].value+' '+getRandom('prompt'):getRandom('prompt')
      request({cmd:prompt,userid:i.member?i.member.id:i.user.id,username:i.member?i.member.user.username:i.user.username,bot:i.member?i.member.user.bot:i.user.bot,channelid:i.channel.id,guildid:i.guildID?i.guildID:undefined,attachments:[]})
    }
  },
  {
    name: 'lexica',
    description: 'Search lexica.art with keywords or an image url',
    options: [ {type: 3, name: 'query', description: 'What are you looking for', required: true} ],
    cooldown: 500,
    execute: (i) => {
      var query = ''
      if (i.data.options) {
        query+= i.data.options[0].value
        if (i.member){var who=i.member}else if(i.user){var who=i.user}
        log('lexica search from '+who.username)
        lexicaSearch(query,i.channel.id)
      }
    }
  },
  {
    name: 'help',
    description: 'Learn how to use this bot',
    cooldown: 500,
    execute: (i) => {
      help(i.channel.id)
    }
  },
  {
    name: 'models',
    description: 'See what models are currently available',
    cooldown: 1000,
    execute: (i) => {
      listModels(i.channel.id)
    }
  },
  {
    name: 'embeds',
    description: 'See what embeddings are currently available',
    cooldown: 1000,
    execute: (i) => {
      listEmbeds(i.channel.id)
    }
  },
  {
    name: 'text',
    description: 'Add text overlays to an image',
    options: [
      {type: 3, name: 'text', description: 'What to write on the image', required: true, min_length: 1, max_length:500 },
      {type: 11, name: 'attachment', description: 'Image to add text to', required: true},
      {type: 3, name: 'position', description: 'Where to position the text',required: false,value: 'south',choices: [{name:'centre',value:'centre'},{name:'north',value:'north'},{name:'northeast',value:'northeast'},{name:'east',value:'east'},{name:'southeast',value:'southeast'},{name:'south',value:'south'},{name:'southwest',value:'southwest'},{name:'west',value:'west'},{name:'northwest',value:'northwest'}]},
      {type: 3, name: 'color', description: 'Text color (name or hex)', required: false, min_length: 1, max_length:50 },
      {type: 3, name: 'blendmode', description: 'How to blend the text layer', required: false,value:'overlay',choices:[{name:'clear',value:'clear'},{name:'over',value:'over'},{name:'out',value:'out'},{name:'atop',value:'atop'},{name:'dest',value:'dest'},{name:'xor',value:'xor'},{name:'add',value:'add'},{name:'saturate',value:'saturate'},{name:'multiply',value:'multiply'},{name:'screen',value:'screen'},{name:'overlay',value:'overlay'},{name:'darken',value:'darken'},{name:'lighten',value:'lighten'},{name:'color-dodge',value:'color-dodge'},{name:'color-burn',value:'color-burn'},{name:'hard-light',value:'hard-light'},{name:'soft-light',value:'soft-light'},{name:'difference',value:'difference'},{name:'exclusion',value:'exclusion'}] }, // should be dropdown
      {type: 3, name: 'width', description: 'How many pixels wide is the text?', required: false, min_length: 1, max_length:5 },
      {type: 3, name: 'height', description: 'How many pixels high is the text?', required: false, min_length: 1, max_length:5 },
      {type: 3, name: 'font', description: 'What font to use', required: false,value:'Arial',choices:fontsSlashCmd},
      {type: 5, name: 'extend', description: 'Extend the image?', required: false},
      {type: 3, name: 'extendcolor', description: 'What color extension?', required: false, min_length: 1, max_length:10 },
    ],
    cooldown: 500,
    execute: (i) => {
      var ops=i.data.options
      var {text='word',position='south',color='white',blendmode='difference',width=false,height=125,font=fonts[0],extend=false,extendcolor='black'}=ops.reduce((acc,o)=>{acc[o.name]=o.value;return acc}, {})
      var userid=i.member ? i.member.id : i.user.id
      if (i.data.resolved && i.data.resolved.attachments && i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))){
        var attachmentOrig=i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))
      }
      textOverlay(attachmentOrig.proxyUrl,text,position,i.channel.id,userid,color,blendmode,parseInt(width)||false,parseInt(height),font,extend,extendcolor)
    }
  },
  {
    name: 'background',
    description: 'Remove background from an image',
    options: [
      {type:11,name:'attachment',description:'Image to remove background from',required:true},
      {type: 3, name: 'model', description: 'Which masking model to use',required: false,value: 'u2net',choices: [{name:'u2net',value:'u2net'},{name:'u2netp',value:'u2netp'},{name:'u2net_human_seg',value:'u2net_human_seg'},{name:'u2net_cloth_seg',value:'u2net_cloth_seg'},{name:'silueta',value:'silueta'},{name:'isnet-general-use',value:'isnet-general-use'}]},
      {type: 5, name: 'a', description: 'Alpha matting true/false', required: false,default:false},
      {type: 4, name: 'ab', description: 'Background threshold 0-255 default 10', required: false,min_length:1,max_length:3,value:10},
      {type: 4, name: 'af', description: 'Foreground threshold 0-255 default 240', required: false,value:240},
      {type: 4, name: 'ae', description: 'Alpha erode size 0-255 default 10', required: false,value:10},
      {type: 5, name: 'om', description: 'Mask Only true/false default false', required: false,value:false},
      {type: 5, name: 'ppm', description: 'Post Process Mask true/false default false', required: false,value:false},
      {type: 3, name: 'bgc', description: 'Background color R,G,B,A 0-255 default 0,0,0,0', required: false}
    ],
    cooldown: 500,
    execute: (i) => {
      if (i.data.resolved && i.data.resolved.attachments && i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))){
        var attachmentOrig=i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))
        var userid=i.member ? i.member.id : i.user.id
        var ops=i.data.options
        debugLog(ops)
        var {model='u2net',a=false,ab=10,af=240,ae=10,om=false,ppm=false,bgc='0,0,0,0'}=ops.reduce((acc,o)=>{acc[o.name]=o.value;return acc}, {})
        removeBackground(attachmentOrig.proxyUrl,i.channel.id,userid,model,a,ab,af,ae,om,ppm,bgc)
      }
    }
  }
]
// If credits are active, add /recharge and /balance otherwise don't include them
if(!creditsDisabled)
{
  slashCommands.push({
    name: 'recharge',
    description: 'Recharge your render credits with Hive, HBD or Bitcoin over lightning network',
    cooldown: 500,
    execute: (i) => {if (i.member) {rechargePrompt(i.member.id,i.channel.id)} else if (i.user){rechargePrompt(i.user.id,i.channel.id)}}
  })
  slashCommands.push({
    name: 'balance',
    description: 'Check your credit balance',
    cooldown: 500,
    execute: (i) => {var userid=i.member?i.member.id:i.user.id;balancePrompt(userid,i.channel.id)}
  })
}

// Functions
function auto2invoke(text) {
  // convert auto1111 weight syntax to invokeai
  // todo convert lora syntax eg <lora:add_detail:1> to withLora(add_detail,1)
  const regex = /\(([^)]+):([^)]+)\)/g
  return text.replaceAll(regex, function(match, $1, $2) {
    return '('+$1+')' + $2
  })
}

async function request(request){
  // request = { cmd: string, userid: int, username: string, bot: false, channelid: int, guildid: int, attachments: {}, }
  if (request.cmd.includes('{')) { request.cmd = replaceRandoms(request.cmd) } // swap randomizers
  var args = parseArgs(request.cmd.split(' '),{string: ['template','init_img','sampler','text_mask','A',],boolean: ['seamless','hires_fix']}) // parse arguments //
  // alias invokeai parameter names
  if(args.s){args.steps=args.s}
  if(args.S){args.seed=args.S}
  if(args.W){args.width=args.W}
  if(args.H){args.height=args.H}
  if(args.C){args.scale=args.C}
  if(args.A){args.sampler=args.A}
  if(args.f){args.strength=args.f}
  if(args.hrf){args.hires_fix=args.hrf}
  // messy code below contains defaults values, check numbers are actually numbers and within acceptable ranges etc
  // let sanitize all the numbers first
  for (n in [args.width,args.height,args.steps,args.seed,args.strength,args.scale,args.number,args.threshold,args.perlin]){
    n=n.replaceAll(/[^０-９\.]/g, '') // not affecting the actual args
  }
  //args.width=(args.width&&Number.isInteger(args.width)&&args.width<256)?args.width:defaultSize
  if (!args.width||!Number.isInteger(args.width)||args.width<256){args.width=defaultSize}
  if (!args.height||!Number.isInteger(args.height)||args.height<256){args.height=defaultSize}
  if ((args.width*args.height)>config.pixelLimit) { // too big, try to compromise, find aspect ratio and use max resolution of same ratio
    if (args.width===args.height){
      args.width=closestRes(Math.sqrt(config.pixelLimit)); args.height=closestRes(Math.sqrt(config.pixelLimit))
    } else if (args.width>args.height){
      var ratio = args.height/args.width
      args.width=closestRes(Math.sqrt(config.pixelLimit))
      args.height=closestRes(args.width*ratio)
    } else {
      var ratio = args.width/args.height
      args.height=closestRes(Math.sqrt(config.pixelLimit))
      args.width=closestRes(args.height*ratio)
    }
    args.width=parseInt(args.width);args.height=parseInt(args.height)
    log('compromised resolution to '+args.width+'x'+args.height)
  }
  if (!args.steps||!Number.isInteger(args.steps)||args.steps>maxSteps){args.steps=defaultSteps} // default 50
  if (!args.seed||!Number.isInteger(args.seed)||args.seed<1||args.seed>4294967295){args.seed=getRandomSeed()}
  if (!args.strength||args.strength>1||args.strength<=0){args.strength=defaultStrength}
  if (!args.scale||args.scale>200||args.scale<1){args.scale=defaultScale}
  if (!args.sampler){args.sampler=defaultSampler}
  if (args.n){args.number=args.n}
  if (!args.number||!Number.isInteger(args.number)||args.number>maxIterations||args.number<1){args.number=1}
  if (!args.renderer||['localApi'].includes(args.renderer)){args.renderer='localApi'}
  if (!args.gfpgan_strength){args.gfpgan_strength=0}
  if (!args.codeformer_strength){args.codeformer_strength=0}
  if (!args.upscale_level){args.upscale_level=''}
  if (!args.upscale_strength){args.upscale_strength=0.5}
  if (!args.variation_amount||args.variation_amount>1||args.variation_amount<0){args.variation_amount=0}
  if (!args.with_variations){args.with_variations=[]}else{log(args.with_variations)}//; args.with_variations=args.with_variations.toString()
  if (!args.threshold){args.threshold=0}
  if (!args.perlin||args.perlin>1||args.perlin<0){args.perlin=0}
  if (!args.model||args.model===undefined||!Object.keys(models).includes(args.model)){args.model=defaultModel}else{args.model=args.model}
  args.timestamp=moment()
  args.prompt=sanitize(args._.join(' '))
  if (args.no) args.prompt+=' ['+args.no+']'
  // Check NSFW status of channel, modify prompt if open channel
  // todo can we tell if the user themselves are age verified besides requesting inside nsfw channel ?
  var censoredPrompt=false
  try{
    var channel=undefined
    if(request.channelid){channel = await bot.getChannel(request.channelid)}
    var channelNsfw=false
    if(!channel||!request.guildid){channelNsfw=true} // If missing channel or guild completely its a DM, enable nsfw
    if((channel&&Object.keys(channel).includes('nsfw'))){channelNsfw=channel.nsfw} // enforce consistency, undefined===false & probably DM
    if(channelNsfw===undefined) channelNsfw=false
    if(config.nsfwWords===''||config.nsfwWords===undefined||config.nsfwWords.length===0) channelNsfw=true // if wordlist disabled, skip
    if(!channelNsfw&&!isPromptSFW(args.prompt)){ // NSFW words defined, SFW channel, not a DM channel, NSFW prompt
      debugLog(('Censoring Prompt - Channel is nsfw: '+channelNsfw+' , Prompt is nsfw:'+!isPromptSFW(args.prompt)+' , Channel id: '+request.channelid+' , User id: '+request.userid).bgRed.black)
      // todo if SFW channel, attempt to find NSFW channel for guild before falling back to filter prompts
      censoredPrompt=true
      args.prompt=makePromptSFW(args.prompt)
    }
  }catch(err){debugLog(err)}
  if (args.prompt.length===0){args.prompt=getRandom('prompt');log('empty prompt found, adding random')}
  args.prompt = auto2invoke(args.prompt)
  var newJob={
    id: queue.length+1,
    status: 'new',
    cmd: request.cmd,
    userid: request.userid,
    username: request.username,
    timestampRequested: args.timestamp,
    channel: request.channelid,
    guild:request.guildid,
    attachments: request.attachments,
    seed: args.seed,
    number: args.number,
    width: args.width,
    height: args.height,
    steps: args.steps,
    prompt: args.prompt,
    scale: args.scale,
    sampler: args.sampler,
    renderer: args.renderer,
    strength: args.strength,
    threshold: args.threshold,
    perlin: args.perlin,
    gfpgan_strength: args.gfpgan_strength,
    codeformer_strength: args.codeformer_strength,
    upscale_level: args.upscale_level,
    upscale_strength: args.upscale_strength,
    variation_amount: args.variation_amount,
    with_variations: args.with_variations,
    results: [],
    model: args.model,
    censoredPrompt: censoredPrompt
  }
  if(args.text_mask){newJob.text_mask=args.text_mask}
  if(args.mask){newJob.text_mask=args.mask}
  if(args.mask_strength){newJob.mask_strength=args.mask_strength}
  if(args.invert_mask===true||args.invert_mask==='True'){newJob.invert_mask=true}else{newJob.invert_mask=false}
  if(args.seamless===true||args.seamless==='True'){newJob.seamless=true}else{newJob.seamless=false}
  if(args.hires_fix===true||args.hires_fix==='True'){newJob.hires_fix=true}else{newJob.hires_fix=false}
  if(args.symv){newJob.symv=args.symv}
  if(args.symh){newJob.symh=args.symh}
  if(newJob.channel==='webhook'&&request.webhook){newJob.webhook=request.webhook}
  if(creditsDisabled){newJob.cost=0}else{newJob.cost=costCalculator(newJob)}
  // check if near identical job already exists unfinished in the queue for the same channel
  var identicalJob = queue.find(q=>{if(q.seed===newJob.seed&&q.channel===newJob.channel&&q.prompt===newJob.prompt&&q.model===newJob.model&&['new','rendering'].includes(q.status)&&q.steps===newJob.steps&&q.sampler===newJob.sampler&&q.strength===newJob.strength&&q.attachments===newJob.attachments&&q.scale===newJob.scale&&q.width===newJob.width&&q.height===newJob.height&&q.perlin===newJob.perlin&&q.upscale_level===newJob.upscale_level&&q.with_variations===newJob.with_variations){return true}else{return false}})
  if(identicalJob){
    debugLog('Identical job posted by '+newJob.username+' , ignoring')
  } else {
    queue.push(newJob)
    dbWrite() // Push db write after each new addition
  }
  processQueue()
}

queueStatusLock=false
async function queueStatus() {
  if(queueStatusLock===true){return}else{queueStatusLock=true}
  sent=false;
  var renderq=queue.filter((j)=>j.status==='rendering')
  var renderGps=tidyNumber((getPixelStepsTotal(renderq)/1000000).toFixed(0))
  var statusMsg=''
  if(renderq.length>0){
    var next = renderq[0]
    statusMsg+='\n:track_next:'
    statusMsg+='`'+next.prompt + '`'
    if(next.number!==1){statusMsg+='x'+next.number}
    if(next.upscale_level!==''){statusMsg+=':mag:'}
    if(next.gfpgan_strength!==0){statusMsg+=':lipstick:'}
    if(next.codeformer_strength!==0){statusMsg+=':lipstick:'}
    if(next.variation_amount!==0){statusMsg+=':microbe:'}
    if(next.steps>defaultSteps){statusMsg+=':recycle:'}
    if(next.seamless===true){statusMsg+=':knot:'}
    if(next.hires_fix===true){statusMsg+=':telescope:'}
    if(next.init_img && next.init_img!==''){statusMsg+=':paperclip:'}
    if((next.width!==next.height)||(next.width>defaultSize)){statusMsg+=':straight_ruler:'}
    statusMsg+=' :brain: **'+next.username+'** :coin:`'+costCalculator(next)+'` :fire:`'+renderGps+'`'
    var renderPercent=((parseInt(progressUpdate['currentStep'])/parseInt(progressUpdate['totalSteps']))*100).toFixed(2)
    if(['k_heun','k_dpm_2_a'].includes(next.sampler)){renderPercent = (renderPercent/2).toFixed(2)} // Stop buggy display of double percent for these samplers
    statusMsg+='\n'+emojiProgressBar(renderPercent)+' `'+progressUpdate['currentStatus'].replace('common.status','')+'` '
    if (progressUpdate['currentStatusHasSteps']===true&&!isNaN(renderPercent)){
      statusMsg+='`'+renderPercent ? renderPercent+'%' : 100+'% Step '+progressUpdate['currentStep']+'/'+progressUpdate['totalSteps']+'`'
      if (progressUpdate['totalIterations']>1){
        statusMsg+=' Iteration `'+progressUpdate['currentIteration']+'/'+progressUpdate['totalIterations']+'`'
      }
      if(progressUpdate['totalSteps']&&progressUpdate['currentStep']){
        //statusMsg+='\n'+progressBar(progressUpdate['totalSteps'],progressUpdate['currentStep'])[0]
        statusMsg+=' '+emojiProgressBar(renderPercent)
        //debugLog(emojiProgressBar(renderPercent))
      }
    }
    var statusObj={content:statusMsg}
    if(next&&next.channel!=='webhook'){var chan=next.channel}else{var chan=config.channelID}
    if(dialogs.queue!==null){ // reuse existing dialog
      if(dialogs.queue.channel.id!==next.channel){dialogs.queue.delete().catch((err)=>{}).then(()=>{dialogs.queue=null})}
      if(showPreviews&&intermediateImage!==null){ // todo check if channel is nsfw, hide if not
        var previewImg=intermediateImage
        if(previewImg!==null){statusObj.file={file:previewImg,contentType:'image/png',name:next.id+'.png'}}
      } else { // previewImages disabled, show spinner instead
        //var spinnergif='https://cdn.discordapp.com/attachments/968822563662860338/1117650395414667274/animation_200_lis9s2g5.gif'
        //statusObj.content+='\n'+spinnergif
        //statusObj.file={file:spinner,contentType:'image/gif',name:spinnerFilename}
      }
      dialogs.queue.edit(statusObj)
      .then(x=>{
        dialogs.queue=x
        sent=true
        queueStatusLock=false
      })
      .catch((err)=>{queueStatusLock=false;sent=false})
    } else { // new progress dialog
      if(sent===false&&dialogs.queue===null){
        bot.createMessage(chan,statusMsg).then(x=>{dialogs.queue=x;queueStatusLock=false}).catch((err)=>{dialogs.queue=null;queueStatusLock=false})
      }
    }
  }
}

function closestRes(n){ // diffusion needs a resolution as a multiple of 64 pixels, find the closest
    var q, n1, n2; var m=64
    q=n/m
    n1=m*q
    if((n*m)>0){n2=m*(q+1)}else{n2=m*(q-1)}
    if(Math.abs(n-n1)<Math.abs(n-n2)){return n1.toFixed(0)}
    return n2.toFixed(0)
}
function prepSlashCmd(options) { // Turn partial options into full command for slash commands, hate the redundant code here
  var job={}
  var defaults=[{ name: 'prompt', value: ''},{name: 'width', value: defaultSize},{name:'height',value:defaultSize},{name:'steps',value:defaultSteps},{name:'scale',value:defaultScale},{name:'sampler',value:defaultSampler},{name:'seed', value: getRandomSeed()},{name:'strength',value:0.75},{name:'number',value:1},{name:'gfpgan_strength',value:0},{name:'codeformer_strength',value:0},{name:'upscale_strength',value:0.5},{name:'upscale_level',value:''},{name:'seamless',value:false},{name:'variation_amount',value:0},{name:'with_variations',value:[]},{name:'threshold',value:0},{name:'perlin',value:0},{name:'hires_fix',value:false},{name:'model',value:defaultModel}]
  defaults.forEach(d=>{if(options.find(o=>{if(o.name===d.name){return true}else{return false}})){job[d.name]=options.find(o=>{if(o.name===d.name){return true}else{return false}}).value}else{job[d.name]=d.value}})
  return job
}
function getCmd(newJob){
  var cmd = newJob.prompt+' --width ' + newJob.width + ' --height ' + newJob.height + ' --seed ' + newJob.seed + ' --scale ' + newJob.scale + ' --sampler ' + newJob.sampler + ' --steps ' + newJob.steps + ' --strength ' + newJob.strength + ' --n ' + newJob.number + ' --gfpgan_strength ' + newJob.gfpgan_strength + ' --codeformer_strength ' + newJob.codeformer_strength + ' --upscale_level ' + newJob.upscale_level + ' --upscale_strength ' + newJob.upscale_strength + ' --threshold ' + newJob.threshold + ' --perlin ' + newJob.perlin + ' --seamless ' + newJob.seamless + ' --hires_fix ' + newJob.hires_fix + ' --variation_amount ' + newJob.variation_amount + ' --with_variations ' + newJob.with_variations + ' --model ' + newJob.model
  if(newJob.text_mask){cmd+=' --text_mask '+newJob.text_mask}
  return cmd
}
function getRandomSeed(){return Math.floor(Math.random()*4294967295)}
async function chat(msg){if(msg!==null&&msg!==''){bot.createMessage(config.channelID, msg).then().catch(err=>{log(err)})}}
async function chatChan(channel,msg){if(msg!==null&&msg!==''){bot.createMessage(channel, msg).then().catch(err=>{log(err)})}}
function sanitize(prompt){
  if(prompt===undefined)return
  if(config.bannedWords.length>0){config.bannedWords.split(',').forEach((bannedWord,index)=>{var regex = new RegExp(bannedWord, 'gi');prompt=prompt.replaceAll(regex,'')})}
  return prompt.replaceAll(/[^一-龠ぁ-ゔァ-ヴーa-zA-Z0-9_ａ-ｚＡ-Ｚ０-９々〆〤ヶ+()=!\"\&\*\[\]<>\\\/\- ,.\:\u0023-\u0039\u200D\u20E3\u2194-\u2199\u21A9-\u21AA\u231A-\u231B\u23E9-\u23EC\u23F0\u23F3\u25AA-\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614-\u2615\u261D\u263A\u2648-\u2653\u2660\u2663\u2665-\u2666\u2668\u267B\u267F\u2693\u26A0-\u26A1\u26AA-\u26AB\u26BD-\u26BE\u26C4-\u26C5\u26CE\u26D1\u26D3-\u26D4\u26E9\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2733-\u2734\u2744\u2747\u274C-\u274D\u274E\u2753-\u2755\u2757\u2763-\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934-\u2935\u2B05-\u2B07\u2B1B-\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ\u00A0\uFEFF]/g, '').replaceAll('`','')
}
function authorised(who,channel,guild) {
  if (userid===config.adminID){return true} // always allow admin
  var bannedUsers=[];var allowedGuilds=[];var bannedGuilds=[]; var allowedChannels=[];var ignoredChannels=[];var userid=null;var username=null
  if (who.user && who.user.id && who.user.username){userid = who.user.id;username = who.user.username} else {userid=who.author.id;username=who.author.username}
  if (config.bannedUsers?.length>0){bannedUsers=config.bannedUsers.split(',')}
  if (config.allowedGuilds?.length>0){allowedGuilds=config.allowedGuilds.split(',')}
  if (config.bannedGuilds&&config.bannedGuilds.length>0){bannedGuilds=config.bannedGuilds.split(',')}
  if (config.allowedChannels?.length>0){allowedChannels=config.allowedChannels.split(',')}
  if (config.ignoredChannels?.length>0){ignoredChannels=config.ignoredChannels.split(',')}
  if (bannedUsers.includes(userid)){
    log('auth fail, user is banned:'+username);return false
  } else if(guild && allowedGuilds.length>0 && !allowedGuilds.includes(guild)||guild&&bannedGuilds.includes(guild)){
    log('auth fail by '+username+', guild not allowed:'+guild);return false
  } else if(channel && allowedChannels.length>0 && !allowedChannels.includes(channel)){
    log('auth fail by '+username+', channel not allowed:'+channel);return false
  } else if (channel && ignoredChannels.length>0 && ignoredChannels.includes(channel)){
    log('auth fail by '+username+', channel is ignored:'+channel);return false
  } else { return true }
}
function createNewUser(id){
  if(id.id){id=id.id}
  users.push({id:id, credits:100}) // 100 creds for new users
  dbWrite() // Sync after new user
  log('created new user with id '.bgBlue.black.bold + id)
}
function userCreditCheck(userID,amount) { // Check if a user can afford a specific amount of credits, create if not existing yet
  var user=users.find(x=>x.id===String(userID))
  if(!user){createNewUser(userID);user=users.find(x=>x.id===String(userID))}
  if(parseFloat(user.credits)>=parseFloat(amount)||creditsDisabled){return true}else{return false}
}
function costCalculator(job) {                 // Pass in a render, get a cost in credits
  if(creditsDisabled){return 0}                // Bypass if credits system is disabled
  var cost=1                                   // a normal render base cost, 512x512 30 steps
  var pixelBase=defaultSize*defaultSize        // reference pixel size
  var pixels=job.width*job.height              // How many pixels does this render use?
  cost=(pixels/pixelBase)*cost                 // premium or discount for resolution relative to default
  cost=(job.steps/defaultSteps)*cost           // premium or discount for step count relative to default
  if (job.gfpgan_strength!==0){cost=cost*1.05} // 5% charge for gfpgan face fixing (minor increased processing time)
  if (job.codeformer_strength!==0){cost=cost*1.05} // 5% charge for gfpgan face fixing (minor increased processing time)
  if (job.upscale_level===2){cost=cost*1.5}    // 1.5x charge for upscale 2x (increased processing+storage+bandwidth)
  if (job.upscale_level===4){cost=cost*2}      // 2x charge for upscale 4x
  if (job.hires_fix===true){cost=cost*1.5}     // 1.5x charge for hires_fix (renders once at half resolution, then again at full)
  //if (job.channel!==config.channelID){cost=cost*1.1}// 10% charge for renders outside of home channel
  cost=cost*job.number                         // Multiply by image count
  return cost.toFixed(2)                       // Return cost to 2 decimal places
}
function creditsRemaining(userID){return users.find(x=>x.id===userID).credits}
function chargeCredits(userID,amount){
  if(!creditsDisabled){
    var user=users.find(x=>x.id===userID)
    if (user){
      user.credits=(user.credits-amount).toFixed(2)
      dbWrite()
      var z='charged id '+userID+' - '+amount.toFixed(2)+'/'
      if(user.credits>90){z+=user.credits.bgBrightGreen.black}else if(user.credits>50){z+=user.credits.bgGreen.black}else if(user.credits>10){z+=user.credits.bgBlack.white}else{z+=user.credits.bgRed.white}
      log(z.dim.bold)
    } else {
      log('Unable to find user: '+userID)
    }
  }
}
async function creditTransfer(credits,from,to,channel){ // allow credit transfers between users
  var userFrom=users.find(x=>x.id===from)
  var userTo=users.find(x=>x.id===to)
  if(!userTo){createNewUser(to);userTo=users.find(x=>x.id===to)}
  if(parseFloat(credits)&&userFrom&&userTo&&parseFloat(userFrom.credits)>(parseFloat(credits)+100)){ // Only allow users to transfer credits above and beyond the starter balance (only paid credit)
    userFrom.credits=parseFloat(userFrom.credits)-parseFloat(credits) // todo charge user function rather then directly subtract from db
    creditRecharge(credits,'transfer',userTo.id,credits+' CREDITS',userFrom.id) // add user credit, log in payment db
    //userTo.credits=parseFloat(userTo.credits)+parseFloat(credits)
    //payments.push({credits:credits,txid:'transfer',timestamp:moment.now(),userid:userTo,userFrom:userFrom,amount:credits+' CREDITS'})
    //dbWrite() // save db after transfers
    var successMsg='<@'+from+'> gifted `'+credits+'` :coin: to <@'+to+'>'
    log(successMsg)
    try{bot.createMessage(channel,successMsg)}catch(err){log(err)}
  } else if (parseFloat(credits)>parseFloat(userFrom.credits)) {
    var errorMsg=':warning: <@'+from+'> has insufficient balance to gift `'+credits+'` :coin:'
    try{bot.createMessage(channel,errorMsg)}catch(err){log(err)}
  } else if (parseFloat(userFrom.credits)>(parseFloat(credits)+100)) {
    var errorMsg=':warning: Only paid credit beyond the initial 100 free :coin: can be transferred'
    try{bot.createMessage(channel,errorMsg)}catch(err){log(err)}
  } else {
    log('Gifting failed for '+from)
  }
}

async function creditRecharge(credits,txid,userid,amount,from=false){ // add credit to user
  var user=users.find(x=>x.id===String(userid))
  if(!user){await createNewUser(userid);var user=users.find(x=>x.id===userid)}
  if(user&&user.credits){user.credits=(parseFloat(user.credits)+parseFloat(credits)).toFixed(2)}
  if(!['manual','free','transfer'].includes(txid)){
    payments.push({credits:credits,timestamp:moment.now(),txid:txid,userid:userid,amount:amount,})
    var paymentMessage = ':tada: <@'+userid+'> added :coin:`'+credits+'`, balance is now :coin:`'+user.credits+'`\n:heart_on_fire:'
    if(from){paymentMessage+='Thanks `'+from+'` for the `'+amount+'` donation to the GPU fund.\n Type !recharge to get your own topup info'
    }else{paymentMessage+='Thanks for the `'+amount+'` donation to the GPU fund.\n Type !recharge to get your own topup info'}
    chat(paymentMessage)
    directMessageUser(config.adminID,paymentMessage)
  }
  dbWrite()
}
function freeRecharge(){
  // allow for regular topups of empty accounts
  // new users get 100 credits on first appearance, then freeRechargeAmount more every 12 hours IF their balance is less then freeRechargeMinBalance
  var freeRechargeMinBalance=parseInt(config.freeRechargeMinBalance)||10
  var freeRechargeAmount=parseInt(config.freeRechargeAmount)||10
  var freeRechargeUsers=users.filter(u=>u.credits<freeRechargeMinBalance)
  if(freeRechargeUsers.length>0&&freeRechargeAmount>0){
    log(freeRechargeUsers.length+' users with balances below '+freeRechargeMinBalance+' getting a free '+freeRechargeAmount+' credit topup')
    freeRechargeUsers.forEach(u=>{
      var nc = parseFloat(u.credits)+freeRechargeAmount  // Incentivizes drain down to 9 for max free charge leaving balance at 19
      creditRecharge(nc,'free',u.id,nc+' CREDITS',config.adminID)
      directMessageUser(u.id,':fireworks: You received a free '+freeRechargeAmount+' :coin: topup!\n:information_source:Everyone with a balance below '+freeRechargeMinBalance+' will get this once every 12 hours')
    })
    chat(':fireworks:'+freeRechargeUsers.length+' users with a balance below `'+freeRechargeMinBalance+'`:coin: just received their free credit recharge')
  }else{
    log('No users eligible for free credit recharge')
  }
}

async function dbWrite() {
  time('dbWrite')
  const files = [{name:'./config/dbQueue.json',data:{queue:queue}},{name:'./config/dbUsers.json',data:{users:users}},{name:'./config/dbPayments.json',data:{payments:payments}}] 
  files.forEach(async (file) => {
    const dataExists = await fsExists(file.name)
    var dataOnDisk = await fsPromises.readFile(file.name,'utf8')
    const dataIsDifferent = dataExists && JSON.stringify(file.data) !== dataOnDisk
    if(dataIsDifferent){
      try{
        await fsPromises.writeFile(`${file.name}.tmp.json`, JSON.stringify(file.data))
        await fsPromises.rename(`${file.name}.tmp.json`, file.name)
      }catch(err){log('Failed to write db file'.bgRed);log(err)}
    }
  })
  timeEnd('dbWrite')
}
dbWrite=debounce(dbWrite,10000,true) // at least 10 seconds between writes

function dbRead() { // todo update to async fsPromises.readFile
  time('dbRead')
  try{
    queue=JSON.parse(fs.readFileSync('./config/dbQueue.json')).queue
    users=JSON.parse(fs.readFileSync('./config/dbUsers.json')).users
    payments=JSON.parse(fs.readFileSync('./config/dbPayments.json')).payments
  } catch (err){log('Failed to read db files'.bgRed);log(err)}
  timeEnd('dbRead')
}
async function dbScheduleRead(){
  log('read schedule db'.grey.dim)
  try{
    await fsPromises.readFile(dbScheduleFile)
      .then(data=>{
        var j=JSON.parse(data)
        schedule=j.schedule
        scheduleInit()
      })
      .catch(err=>{log(err)})
  }
  catch(err){console.error('failed to read schedule db');console.error(err)}
}
function scheduleInit(){
  // cycle through the active schedule jobs, set up render jobs with cron
  log('init schedule'.grey)
  schedule.filter(s=>s.enabled==='True').forEach(s=>{
    log('Scheduling job: '.grey+s.name)
    cron.schedule(s.cron,()=>{
      log('Running scheduled job: '.grey+s.name)
      var randomPromptObj=s.prompts[Math.floor(Math.random()*s.prompts.length)]
      var randomPrompt = randomPromptObj.prompt
      Object.keys(randomPromptObj).forEach(key => {
        if(key!=='prompt'){
          randomPrompt += ` --${key} ${randomPromptObj[key]}`
        }
      });
      var newRequest={cmd: randomPrompt, userid: s.admins[0].id, username: s.admins[0].username, bot: 'False', channelid: s.channel, attachments: []}
      if(s.onlyOnIdle==="True"){if(queue.filter((q)=>q.status==='new').length>0){log('Ignoring scheduled job due to renders')}else{request(newRequest)}}else{request(newRequest)}
    })
  })
}
async function getPrices () { // todo include hive engine token prices if enabled
  return new Promise(async (resolve,reject)=>{
    time('getPrices')
    var url='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=hive&order=market_cap_asc&per_page=1&page=1&sparkline=false'
    await axios.get(url)
      .then((response)=>{hiveUsd=response.data[0].current_price;lastHiveUsd=hiveUsd;log('HIVE: $'+hiveUsd);resolve(true)})
      .catch(async()=>{
        log('Failed to load data from coingecko api, trying internal market'.red.bold)
        await axios.post(hiveEndpoints[0], {id: 1,jsonrpc: '2.0',method: 'condenser_api.get_ticker',params: []})
          .then((hresponse)=>{hiveUsd=parseFloat(hresponse.data.result.latest);log('HIVE (internal market): $'+hiveUsd);resolve(true)})
          .catch(async(err)=>{
            log('Failed to load data from hive market api')
            log(err)
            await axios('https://api.ausbit.dev/price') // last resort is my own api node
              .then((r=>{
                hiveUsd=parseFloat(r.data.hive.usd)
                log('got hive price from api.ausbit.dev/price : '+hiveUsd)
                resolve(true)
              }))
              .catch((err)=>{
                log('all price discovery methods failed, falling back to previous hive price of '+lastHiveUsd)
                hiveUsd=lastHiveUsd
                reject(err)
              })
          })
    })
  timeEnd('getPrices')
  })
}
function getLightningInvoiceQr(memo,amount=1){
  var appname=config.hivePaymentAddress+'_discord'
  return 'https://api.v4v.app/v1/new_invoice_hive?hive_accname='+config.hivePaymentAddress+'&amount='+amount+'&currency=HBD&usd_hbd=false&app_name='+appname+'&expiry=300&message='+memo+'&qr_code=png'
}
function getPixelSteps(job){ // raw (width * height) * (steps * number). Does not account for postprocessing
  var p=parseInt(job.width)*parseInt(job.height)
  var s= parseInt(job.steps)*parseInt(job.number)
  var ps=p*s
  return ps
}
function getPixelStepsTotal(jobArray){
  var ps=0
  jobArray.forEach((j)=>{ps=ps+getPixelSteps(j)})
  return ps
}
function balancePrompt(userid,channel){
  userCreditCheck(userid,1) // make sure the account exists first
  var msg='<@'+userid+'> you have `'+creditsRemaining(userid)+'` :coin:'
  log('Balance Check: '+msg)
  bot.createMessage(channel,msg).then().catch(err=>{log(err)})
}
async function rechargePrompt(userid,channel){
  userCreditCheck(userid,1) // make sure the account exists first
  checkNewPayments()
  var user=users.find(x=>x.id===String(userid))
  var hive1usd = (1/hiveUsd).toFixed(3)
  var paymentMemo=config.hivePaymentPrefix+userid
  var paymentLinkHbd='https://hivesigner.com/sign/transfer?to='+config.hivePaymentAddress+'&amount=1.000%20HBD&memo='+paymentMemo
  var paymentLinkHive='https://hivesigner.com/sign/transfer?to='+config.hivePaymentAddress+'&amount='+hive1usd+'%20HIVE&memo='+paymentMemo
  var lightningInvoiceQr=getLightningInvoiceQr(paymentMemo)
  var paymentMsg=''
  paymentMsg+='<@'+userid+'> you have `'+creditsRemaining(userid)+'` :coin: remaining\n*The rate is `1` **USD** per `500` :coin: *\n'
  paymentMsg+= 'You can send any amount of HIVE <:hive:1110123056501887007> or HBD <:hbd:1110282940686016643> to `'+config.hivePaymentAddress+'` with the memo `'+paymentMemo+'` to top up your balance\n'
  if(config.allowHiveEnginePayments&&config.allowedHETokens.length>0){
    // hive engine transfers
    // var transferjson=
    // https://hivesigner.com/sign/custom-json?authority=active&required_auths=%5B%22'+username+'%22%5D&required_posting_auths=%5B%5D&id=ssc-mnainnet-hive&json=${encodeURIComponent(json)}&redirect_uri=https://ecency.com/
    paymentMsg+='\n**Accepting these Hive-Engine tokens:** '+config.allowedHETokens
  }
  //paymentMsg+= '**Pay 1 HBD:** '+paymentLinkHbd+'\n**Pay 1 HIVE:** '+paymentLinkHive
  var freeRechargeMsg='..Or just wait for your FREE recharge of 10 credits twice daily'
  var rechargeImages=['https://media.discordapp.net/attachments/1024766656347652186/1110852592864595988/237568213750251520-1684918295766-text.png','https://media.discordapp.net/attachments/1024766656347652186/1110862401420677231/237568213750251520-1684920634773-text.png','https://media.discordapp.net/attachments/1024766656347652186/1110865969645105213/237568213750251520-1684921485321-text.png','https://media.discordapp.net/attachments/968822563662860338/1110869028475523174/237568213750251520-1684922214077-text.png','https://media.discordapp.net/attachments/1024766656347652186/1110872463736324106/237568213750251520-1684923032433-text.png','https://media.discordapp.net/attachments/1024766656347652186/1110875096106676256/237568213750251520-1684923660927-text.png','https://media.discordapp.net/attachments/1024766656347652186/1110876051694952498/237568213750251520-1684923889116-text.png','https://media.discordapp.net/attachments/1024766656347652186/1110877696726159370/237568213750251520-1684924281507-text.png','https://media.discordapp.net/attachments/968822563662860338/1110904225384382554/merged_canvas.da2c2db8.png']
  shuffle(rechargeImages)
  var paymentMsgObject={
    content: paymentMsg,
    embeds:
    [
      {image:{url:rechargeImages[0]}},
      {footer:{text:freeRechargeMsg}}
    ],
    components: [
      {type: 1, components:[
        {type: 2, style: 5, label: hive1usd+" HIVE", url:paymentLinkHive, emoji: { name: 'hive', id: '1110123056501887007'}, disabled: false },
        {type: 2, style: 5, label: "1 HBD", url:paymentLinkHbd, emoji: { name: 'hbd', id: '1110282940686016643'}, disabled: false },
        {type: 2, style: 5, label: "$1 of BTC", url:lightningInvoiceQr, emoji: { name: '⚡', id: null}, disabled: false }
      ]}
    ]
  }
  if(config.allowStripePayments&&config.stripeKey.length>0){
    var paymentLinkStripePrefix='http://buy.stripe.com/'
    if(user.stripe&&user.stripe.length>0){
      var paymentLinkStripe=paymentLinkStripePrefix+user.stripe
    } else {
      var paymentLinkStripe=await generateStripeLink(userid)
      var paymentLinkStripeSuffix=paymentLinkStripe.split('/')[3]
      if(paymentLinkStripeSuffix.length>0){
        debugLog('saving new stripe payment code '+paymentLinkStripeSuffix+' for user '+userid)
        user.stripe=paymentLinkStripe.split('/')[3]
        dbWrite() 
      }
    }
    paymentMsgObject.components[0].components.push({type: 2, style: 5, label: "CC via Stripe", url:paymentLinkStripe, emoji: { name: '💳', id: null}, disabled: false })
  }
  directMessageUser(userid,paymentMsgObject,channel).catch((err)=>log(err))
  log('ID '+userid+' asked for recharge link')
}
rechargePrompt=debounce(rechargePrompt,1000,true) // at least 1 second between checks

async function checkNewPayments(){
  time('checkNewPayments')
  // Hive native payments support
  var bitmask=['4','524288'] // transfers and fill_recurrent_transfer only
  var accHistoryLength=config.accHistoryLength||100 // default 100
  log('Checking recent payments for '.grey+config.hivePaymentAddress.grey)
  hive.api.getAccountHistory(config.hivePaymentAddress, -1, accHistoryLength, ...bitmask, function(err, result) {
    if(err){log(err)}
    if(Array.isArray(result)) {
      result.forEach(r=>{
        var tx=r[1]
        var txType=tx.op[0]
        var op=tx.op[1]
        if(txType==='transfer'&&op.to===config.hivePaymentAddress&&op.memo.startsWith(config.hivePaymentPrefix)){
          var amountCredit=0
          var accountId=op.memo.replace(config.hivePaymentPrefix,'')
          var pastPayment=payments.find(x=>x.txid===tx.trx_id)
          if(pastPayment===undefined){
            coin=op.amount.split(' ')[1]
            amount=parseFloat(op.amount.split(' ')[0])
            if(coin==='HBD'){amountCredit=amount*500}else if(coin==='HIVE'){amountCredit=(amount*hiveUsd)*500}
            log('New Payment! credits:'.bgBrightGreen.red+amountCredit+' , amount:'+op.amount)
            creditRecharge(amountCredit,tx.trx_id,accountId,op.amount,op.from)
          }
        }
      })
    } else {log('error fetching account history'.bgRed)}
  })
  // Hive-Engine payments support
  if(config.allowHiveEnginePayments){
    var allowedHETokens=config.allowedHETokens?.split(',')||['SWAP.HBD','SWAP.HIVE']
    try{response = await axios.get('https://history.hive-engine.com/accountHistory?account='+config.hivePaymentAddress+'&limit='+accHistoryLength+'&offset=0&ops=tokens_transfer')}catch(err){log(err)}
    var HEtransactions=response?.data
    var HEbotPayments=HEtransactions.filter(t=>t.to===config.hivePaymentAddress&&allowedHETokens.includes(t.symbol)&&t.memo?.startsWith(config.hivePaymentPrefix))
    var HEapi='https://he.ausbit.dev/contracts'
    var HEapiData={"jsonrpc":"2.0","id":17,"method":"find","params":{"contract":"market","table":"metrics","query":{"symbol":{"$in":allowedHETokens}},"limit":1000,"offset":0,"indexes":[]}}
    var heTokenPriceCache=null
    await axios.post(HEapi,HEapiData).then(r=>{heTokenPriceCache=r.data.result}).catch(err=>{log(err)})
    HEbotPayments.forEach(t=>{
      var pastPayment=payments.find(tx=>tx.txid===t.transactionId)
      var usdValue=0
      var userid=parseInt(t.memo.split('-')[1])
      if(pastPayment===undefined&&Number.isInteger(userid)){ // not in db yet, memo looks correct
        log('potential hive engine recharge..')
        switch(t.symbol){
          case 'SWAP.HIVE': usdValue=parseFloat(t.quantity)*(hiveUsd*0.9925);break // treat like regular HIVE - 0.75% HE withdraw fee
          case 'SWAP.HBD': usdValue=parseFloat(t.quantity)*0.9925;break // treat like regular HBD and peg to $1 - 0.75% HE withdraw fee
          default: {
            try{
              var priceObj=heTokenPriceCache.find(p=>p.symbol===t.symbol)
              var price=parseFloat(priceObj.lastPrice)*hiveUsd
              usdValue=parseFloat(t.quantity)*price*0.9925
              debugLog('calculated price for '+t.quantity+' '+t.symbol+' : '+usdValue)
            }catch(err){log(err)}
            break
          }
        }
        if(allowedHETokens.includes(t.symbol)&&usdValue>0.0001){ // min 0.001 usd recharge
          debugLog('calculated price for '+t.quantity+' '+t.symbol+' : '+usdValue)
          var credits=usdValue*500
          log('New Payment! credits:'.bgBrightGreen.red+credits+' , amount:'+t.quantity+' '+t.symbol+' , from: '+t.from)
          creditRecharge(credits,t.transactionId,String(userid),t.quantity+' '+t.symbol,t.from)
        }
      }
    })
  }
  // Stripe payments support
  if(config.allowStripePayments&&config.stripeKey){
    getStripePayments()
  }
  timeEnd('checkNewPayments')
}
checkNewPayments=debounce(checkNewPayments,30000,true) // at least 30 seconds between checks
const sendWebhook=(job)=>{ // TODO eris has its own internal webhook method, investigate and maybe replace this
  let embeds=[{color:getRandomColorDec(),footer:{text:job.prompt},image:{url:job.webhook.imgurl}}]
  axios({method:"POST",url:job.webhook.url,headers:{ "Content-Type": "application/json" },data:JSON.stringify({embeds})})
    .then((response) => {log("Webhook delivered successfully")})
    .catch((error) => {console.error(error)})
}
function requestModelChange(newmodel){log('Requesting model change to '+newmodel);if(newmodel===undefined||newmodel==='undefined'){newmodel=defaultModel}socket.emit('requestModelChange',newmodel,()=>{log(newmodel+' loaded')})}
function generationResult(data){
  time('generationResult')
  var url=data.url
  url=config.basePath+data.url.split('/')[data.url.split('/').length-1]
  var job=queue[queue.findIndex(j=>j.status==='rendering')] // TODO there has to be a better way to know if this is a job from the web interface or the discord bot // upcoming invokeai api release solves this
  if(job){
    var postRenderObject={id:job.id,filename: url, seed: data.metadata.image.seed, resultNumber:job.results.length, width:data.metadata.image.width,height:data.metadata.image.height}
    // remove redundant data before pushing to db results
    delete (data.metadata.prompt);delete (data.metadata.seed);delete (data.metadata.model_list);delete (data.metadata.app_id);delete (data.metadata.app_version); delete (data.attentionMaps);
    job.results.push(data)
    postRender(postRenderObject)
  }else{rendering=false}
  if(job&&job.results.length>=job.number){job.status='done';dbWrite();rendering=false;processQueue()}// else {debugLog('Not marking job done, waiting for more images')}
  if(dialogs.queue!==null){dialogs.queue.delete().catch((err)=>{}).then(()=>{dialogs.queue=null;intermediateImage=null})}
  timeEnd('generationResult')
}

async function postRender(render){
  time('postRender')
  var filenamesplit=render.filename.split('/')
  debugLog(config.apiUrl+filenamesplit[filenamesplit.length-1]) // can access image via this url internally
  await fsPromises.readFile(render.filename, null) //updated to async version
    .then(async data=>{
      // NOTE: filename being wrong wasn't breaking because slashes get replaced automatically in createMessage, but makes filename long/ugly
      filename=render.filename.split('\\')[render.filename.split('\\').length-1].replace(".png","")
      //var job=queue[queue.findIndex(x=>x.id===render.id)]
      var job=idToJob(render.id)
      var msg=':brain:<@'+job.userid+'>'
      if (showRenderSettings){
        msg+=':straight_ruler:`'+render.width+'x'+render.height+'`'
        if(job.upscale_level!==''){msg+=':mag:**`Upscaledx'+job.upscale_level+' to '+(parseFloat(job.width)*parseFloat(job.upscale_level))+'x'+(parseFloat(job.height)*parseFloat(job.upscale_level))+' ('+job.upscale_strength+')`**'}
        if(job.gfpgan_strength!==0){msg+=':magic_wand:`gfpgan face fix('+job.gfpgan_strength+')`'}
        if(job.codeformer_strength!==0){msg+=':magic_wand:`codeformer face fix(' + job.codeformer_strength + ')`'}
        if(job.seamless===true){msg+=':knot:**`Seamless Tiling`**'}
        if(job.hires_fix===true){msg+=':telescope:**`High Resolution Fix ('+job.strength+')`**'}
        if(job.perlin!==0){msg+=':oyster:**`Perlin '+job.perlin+'`**'}
        if(job.threshold!==0){msg+=':door:**`Threshold '+job.threshold+'`**'}
        if(job.attachments.length>0){msg+=':paperclip:` attached template`:muscle:`'+job.strength+'`'}
        if(job.text_mask){msg+=':mask:`'+job.text_mask+'`'}
        if(job.variation_amount!==0){msg+=':microbe:**`Variation '+job.variation_amount+'`**'}
        if(job.symv||job.symh){msg+=':mirror: `v'+job.symv+',h'+job.symh+'`'}
        if(render.variations){msg+=':linked_paperclips:with variants `'+render.variations+'`'}
        // Added spaces to make it easier to double click the seed to copy/paste, otherwise discord selects whole line
        msg+=':seedling: `'+render.seed+'` :scales:`'+job.scale+'`:recycle:`'+job.steps+'`'
        msg+=':stopwatch:`'+timeDiff(job.timestampRequested, moment())+'s`'
        //if(showFilename){msg+=':file_cabinet:`'+filename+'`'}
        msg+=':eye:`'+job.sampler+'`'
        msg+=':floppy_disk:`'+job.model+'`'
      }
      if(job.webhook){msg+='\n:calendar:Scheduled render sent to `'+job.webhook.destination+'` discord'}
      if(job.cost&&!creditsDisabled){
        chargeCredits(job.userid,(costCalculator(job))/job.number) // only charge successful renders, if enabled
        msg+=':coin:`'+(job.cost/job.number).toFixed(2).replace(/[.,]00$/, "")+'/'+ creditsRemaining(job.userid) +'`'
      }
      var postFilename=filename+'.png'
      var nsfwWarning = job.censoredPrompt ? ':warning: **NSFW prompt modified for SFW channel**\n' : ''
      var channel = job.channel ? await bot.getChannel(job.channel) : undefined
      var channelNsfw=false;var imageNsfw=false // Is this a NSFW channel ?
      if((channel&&Object.keys(channel).includes('nsfw'))){channelNsfw=channel.nsfw}
      if(job.guild===undefined){channelNsfw=true} // disable in DM
      if(channelNsfw===undefined) channelNsfw=false
      if(!config.nsfwChecksEnabled){channelNsfw=true} // bypass if disabled in config
      if(!channelNsfw){ // If in SFW channel, 
        imageNsfw = await isImageNSFW(data) // scan result with nsfwjs
        if(imageNsfw){
          log('spoilered nsfw image')
          postFilename='SPOILER_'+postFilename
          nsfwWarning+=':see_no_evil: **Possible NFSW image detected in SFW channel**\n'
        }
      }
      var newMessage = { content: msg, embeds: [{description: nsfwWarning+job.prompt, color: getRandomColorDec()}], components: [ { type: 1, components: [ ] } ] }
      if(job.prompt.replaceAll(' ','').length===0){newMessage.embeds=[]}
      newMessage.components[0].components.push({ type: 2, style: 2, label: "ReDream", custom_id: "refresh-" + job.id, emoji: { name: '🎲', id: null}, disabled: false })
      newMessage.components[0].components.push({ type: 2, style: 2, label: "Edit Prompt", custom_id: "edit-"+job.id, emoji: { name: '✏️', id: null}, disabled: false })
      newMessage.components[0].components.push({ type: 2, style: 2, label: "Tweak", custom_id: "tweak-"+job.id+'-'+render.resultNumber, emoji: { name: '🧪', id: null}, disabled: false })
      if(newMessage.components[0].components.length<5){newMessage.components[0].components.push({ type: 2, style: 2, label: "Random", custom_id: "editRandom-"+job.id, emoji: { name: '🔀', id: null}, disabled: false })}
      if(newMessage.components[0].components.length===0){delete newMessage.components} // If no components are used there will be a discord api error so remove it
      var filestats=await fsPromises.stat(render.filename)
      var filesize=filestats.size
      if(filesize<defaultMaxDiscordFileSize){ // Within discord 25mb filesize limit
        try{
          bot.createMessage(job.channel, newMessage, {file: data, name: postFilename})
            .then(async m=>{
              debugLog('Posted msg id '+m.id+' to channel id '+m.channel.id)
              if(m.attachments.length>0){
                log('Prompt: '+job.prompt)
                log('Url: '+m.attachments[0].proxy_url.blue.underline)
              }
              //debugLog(render.filename+' - '+(filesize/1000000).toFixed(2)+'mb')
              // todo conditional archiving to a folder named after discord id for long term storage
              // just admin / just paid users / everyone / role based ?
              //if(archiveAfterPost){
              //  make directory if not exist archiveBase+'/'+job.userid
              //  var newfilename=archiveBase+'/'+job.userid
              //  await fsPromises.writeFile(newfilename,data)
              //}
              if(deleteAfterPost){
                // not currently removing outputs\thumbnails (256x256 .webp's)
                fsPromises.unlink(render.filename)
                  .then(debugLog('deleted '+render.filename))
                  .catch(err=>log(err))
              }
            }) // maybe wait till successful post here to change job status? Could store msg id to job
            .catch((err)=>{
              log('caught error posting to discord in channel '.bgRed+job.channel)
              log(err)
              failedToPost.push({channel:job.channel,msg:newMessage,file:data,name:filename+'.png'})
            })
        }catch(err){console.error(err)}
      }else{
        log('Image '+filename+' was too big for discord, failed to post to channel '+job.channel)
        failedToPost.push({channel:job.channel,msg:newMessage,file:data,name:filename+'.png'})
      }
    })
    .catch(err=>{log(err)})
  timeEnd('postRender')
}

var repostFailCount=0
var repostFailLimit=5 // dont try to repost indefinately
async function repostFails(){
  failedToPost.forEach((p)=>{
      bot.createMessage(p.channel,p.msg,{file:p.file,name:p.filename})
        .then(m=>{
          failedToPost=failedToPost.filter(f=>{f.file!==p.file}) //todo unlink posted files if deleteAfterPost ?
          if(repostFailCount>0)repostFailCount--
        })
        .catch(err=>{
          debugLog(err)
          repostFailCount++
          if(repostFailCount>=repostFailLimit)failedToPost=failedToPost.filter(f=>{f.file!==p.file})
        })
  })
}

const processQueue=()=>{
  // WIP attempt to make a harder to dominate queue
  // TODO make a queueing system that prioritizes the users that have recharged the most
  time('ProcessQueue')
  var queueNew=queue.filter((q)=>q.status==='new') // first alias to simplify
  if(queueNew.length>0){
    var queueUnique=queueNew//.filter((value,index,self)=>{return self.findIndex(v=>v.userid===value.userid)===index}) // reduce to 1 entry in queue per username // expensive/slow
    var nextJobId=queueUnique[Math.floor(Math.random()*queueUnique.length)].id // random select
    //var nextJob=queue[queue.findIndex(x=>x.id===nextJobId)]
    var nextJob=idToJob(nextJobId)
  }else{var nextJob=queue[queue.findIndex(x=>x.status==='new')]}
  if(nextJob&&!rendering&&!paused){
    if(userCreditCheck(nextJob.userid,costCalculator(nextJob))){
      busyStatusArr=[{type:0,name:' with '+queueNew.length+' job(s) in '+bot.guilds.size+' servers'}]
      shuffle(busyStatusArr)
      //var statusMsg = 'with '+queueNew.length+' artful idea';if(queueNew.length>1){statusMsg+='s'}
      bot.editStatus('online',{type: busyStatusArr[0].type,name:busyStatusArr[0].name})
      rendering=true
      log(nextJob.username.bgWhite.red+':'+nextJob.cmd.replaceAll('\r','').replaceAll('\n').bgWhite.black)
      addRenderApi(nextJob.id)
    }else{
      log(nextJob.username+' cant afford this render, denying')
      log('cost: '+costCalculator(nextJob))
      log('credits remaining: '+creditsRemaining(nextJob.userid))
      nextJob.status='failed';dbWrite()
      if(config.hivePaymentAddress.length>0){rechargePrompt(nextJob.userid,nextJob.channel)}else{chat('An admin can manually top up your credit with\n`!credit 1 <@'+ nextJob.userid +'>')}
      processQueue()
    }
  }else if(nextJob&&rendering){
  }else if(!nextJob&&!rendering){ // no jobs, not rendering
    renderJobErrors=queue.filter((q)=>q.status==='rendering')
    if(renderJobErrors.length>0){
      log('These job statuses are set to rendering, but rendering=false - this shouldnt happen'.bgRed)
      log(renderJobErrors)
      renderJobErrors.forEach((j)=>{if(j.status==='rendering'){log('setting status to failed for id '+j.id);j.status='failed';dbWrite()}})
    }
    if(failedToPost.length>0){repostFails()}
    //debugLog('Finished queue, setting idle status'.dim)
    idleStatusArr=[ // alternate idle messages
    // 0=playing? 1=Playing 2=listening to 3=watching 5=competing in
      {type:5,name:'meditation in '+bot.guilds.size+' guilds'},
      {type:3,name:'disturbing dreams in '+bot.guilds.size+' guilds'},
      {type:2,name:'your thoughts in '+bot.guilds.size+' guilds'},
      {type:0,name:'the waiting game in '+bot.guilds.size+' guilds'}
    ]
    shuffle(idleStatusArr)
    bot.editStatus('idle',idleStatusArr[0])
  }
  timeEnd('ProcessQueue')
}
lexicaSearch=(query,channel)=>{
  // Quick and dirty lexica search api, needs docs to make it more efficient (query limit etc)
  var api = 'https://lexica.art/api/v1/search?q='+query
  var link = 'https://lexica.art/?q='+require('querystring').escape(query)
  var reply = {content:'Query: `'+query+'`\nTop 10 results from lexica.art api:\n**More:** '+link, embeds:[], components:[]}
  axios.get(api)
    .then((r)=>{
      var filteredResults = r.data.images.filter(i=>i.model==='stable-diffusion')// we only care about SD results
      filteredResults = filteredResults.filter((value, index, self) => {return self.findIndex(v => v.promptid === value.promptid) === index})// want only unique prompt ids
      log('Lexica search for :`'+query+'` gave '+r.data.images.length+' results, '+filteredResults.length+' after filtering')
      shuffle(filteredResults)
      filteredResults=filteredResults.slice(0,10)// shuffle and trim to 10 results // todo make this an option once lexica writes api docs
      filteredResults.forEach(i=>{reply.embeds.push({color: getRandomColorDec(),description: '',image:{url:i.srcSmall},footer:{text:i.prompt}})})
      try{bot.createMessage(channel, reply)}catch(err){debugLog(err)}
    })
    .catch((error) => console.error(error))
}
lexicaSearch=debounce(lexicaSearch,1000,true)

const textOverlay=async(imageurl,text,gravity='south',channel,user,color='white',blendmode='overlay',width=false,height=125,font='Arial',extendimage=false,extendcolor='black')=>{
  // todo caption area as a percentage of image size
  time('textOverlay')
  try{
    var image=(await axios({ url: imageurl, responseType: "arraybuffer" })).data
    var res=await sharp(image)
    if(extendimage){
      switch(gravity){
        case 'south':
        case 'southeast':
        case 'southwest': {res.extend({bottom:height,background:extendcolor});break}
        case 'north':
        case 'northeast':
        case 'northwest': {res.extend({top:height,background:extendcolor});break}
      }
      res = sharp(await res.toBuffer()) // metadata will give wrong height value after our extend, reload it. Not too expensive
    }
    var metadata = await res.metadata()
    if(!width){width=metadata.width-10}
    const overlay = await sharp({text: {text: '<span foreground="'+color+'">'+text+'</span>',rgba: true,width: width,height: height,font: font}}).png().toBuffer()
    res = await res.composite([{ input: overlay, gravity: gravity, blend: blendmode }]) // Combine the text overlay with original image
    try{var buffer = await res.toBuffer()}catch(err){log(err)}
    bot.createMessage(channel, '<@'+user+'> added **text**: `'+text+'`\n**position**: '+gravity+', **color**:'+color+', **blendmode**:'+blendmode+', **width**:'+width+', **height**:'+height+', **font**:'+font+', **extendimage**:'+extendimage+', **extendcolor**:'+extendcolor, {file: buffer, name: user+'-'+new Date().getTime()+'-text.png'})
  }catch(err){log(err)}
  timeEnd('textOverlay')
}

const removeBackground=async(url,channel,user,model='u2net',a=false,ab=10,af=240,ae=10,om=false,ppm=true,bgc='0,0,0,0')=>{
  time('removeBackground')
// js implementation of python rembg lib, degrades quality, needs more testing
//  var image=(await axios({ url: url, responseType: "arraybuffer" })).data
//  image = sharp(image)
//  const remBg = new Rembg({logging: false})
//  var remBgOutput = await remBg.remove(image)
//  var buffer = await remBgOutput.png().toBuffer()

// original rembg python/docker version
// requires docker run -p 127.0.0.1:5000:5000 danielgatis/rembg s
// http://127.0.0.1:5000/?url=imgurl?model=u2net&a=true&ab=10&ae=10&af=240&bgc=0,0,0,0&ppm=true&om=false
// model = u2net,u2netp,u2net_human_seg,u2net_cloth_seg,silueta,isnet-general-use,isnet-anime
// a = alpha matting                          bool default false
// ab = alpha matting background threshold    int 0-255 default 10
// af = alpha matting foreground threshold    int 0-255 default 240
// ae = alpha erode size                      int 0-255 default 10
// om = only mask, returns the mask directly  bool default false
// ppm = post process mask (clean edges)      bool default false
// bgc = background color to insert           str 0,0,0,1 default none , 4 ints 0-255 for RGB + alpha
  var fullUrl=rembg+encodeURIComponent(url)+'&model='+model+'&a='+a+'&ab='+ab+'&ae='+ae+'&af='+af+'&bgc='+bgc+'&ppm='+ppm+'&om='+om
  debugLog('Removing background from image using rembg: '+fullUrl)
  await axios.get(rembg+encodeURIComponent(fullUrl),{responseType: 'arraybuffer'}).then((buffer)=>{
    buffer = buffer.data ? Buffer.from(buffer.data) : undefined
    var newMsg='<@'+user+'> removed background'
    if(!creditsDisabled){newMsg+=' , it cost `0.05`:coin:';chargeCredits(user,0.05)}
    newMsg+='\n**model:**`'+model+'`, **alpha matting:**`'+a+'`, **background threshold:**`'+ab+'`, **alpha erode size:**`'+ae+'` **foreground threshold:**`'+af+'`, **background color:**`'+bgc+'`, **post process:**`'+ppm+'`, **only mask:** `'+om+'`'
    var newMsgObject={content: newMsg,components:[{type: 1, components:[{ type: 2, style: 2, label: "Fill transparency", custom_id: "twkinpaint", emoji: { name: '🖌️', id: null}, disabled: false }]}]}
    try{bot.createMessage(channel, newMsgObject, {file: buffer, name: user+'-bg.png'})}catch(err){log(err)}
  }).catch((err)=>{log(err)})
  timeEnd('removeBackground')
}

const rotate=async(imageurl,degrees=90,channel,user)=>{
  time('rotate')
  try{
    var image=(await axios({ url: imageurl, responseType: "arraybuffer" })).data
    var res=await sharp(image)
    res.rotate(degrees)
    var buffer = await res.png().toBuffer()
    bot.createMessage(channel, '<@'+user+'> rotated image `'+degrees+'` degrees', {file: buffer, name: user+'-'+new Date().getTime()+'-rotate.png'})
  }catch(err){log(err)}
  timeEnd('rotate')
}

const inpaint=async(attachments,prompt=defaultInpaintPrompt,channel,user,username,guild=undefined,mask=undefined)=>{
  try{
    var image=(await axios({ url: attachments[0].proxy_url, responseType: "arraybuffer" })).data
    res=await sharp(image)
    var metadata = await res.metadata()
    var width = metadata.width
    var height = metadata.height
    var cmd = prompt+' --height '+height+' --width '+width+' --model '+defaultModelInpaint+' --strength '+defaultInpaintStrength
    if(mask) cmd+=' --mask '+mask
    request({cmd: cmd, userid: user, username: username, bot: false, channelid: channel,guildid:guild, attachments: attachments})
  }catch(err){log(err)}
}

const expand=async(url,direction='out',amount=null,channel,user)=>{
  if(!url||!channel||!user)return
  // need to ensure a transparent background color on the newly created area
  // blur original input image, scale it up then 0 the opacity and overlay the original
  // img=original , image=new placeholder image, buffer = completed image overlay
  jimp.read(url)
    .then(async img=>{
      //var metadata = await img.metadata()
      if(!amount){amount = 256}//metadata.width/2}
      var expandHeight=amount;var expandWidth=amount;var x=0;var y=0
      switch(direction){ // I hate this but it works
        case 'out':{expandHeight=amount;expandWidth=amount;x=amount/2;y=amount/2;break}
        case 'up':{expandHeight=amount;expandWidth=0;x=0;y=amount;break}
        case 'down':{expandHeight=amount;expandWidth=0;x=0;y=0;break}
        case 'left':{expandHeight=0;expandWidth=amount;x=amount;y=0;break}
        case 'right':{expandHeight=0;expandWidth=amount;x=0;y=0;break}
        case 'horizontal':
        case 'sides':{expandHeight=0;expandWidth=amount;x=amount/2;y=0;break}
        case 'vertical':{expandWidth=0;expandHeight=amount;x=0;y=amount/2}
      }
      time('expand image')
      var newWidth=img.bitmap.width+expandWidth;var newHeight=img.bitmap.height+expandHeight
      img.clone().blur(5).opacity(0).resize(newWidth,newHeight,jimp.RESIZE_NEAREST_NEIGHBOR,(err,imgScaled)=>{
        if(err)log(err)
        imgScaled.blit(img,x,y).getBuffer(jimp.MIME_PNG, (err,buf)=>{
          if(err)log(err)
          var newMsg = '<@'+user+'> used `expand '+direction+'`\nNew image size: '+imgScaled.bitmap.width+' x '+imgScaled.bitmap.height
          var newMsgObject={content: newMsg,components:[{type: 1, components:[{ type: 2, style: 2, label: "Fill transparency", custom_id: "twkinpaint", emoji: { name: '🖌️', id: null}, disabled: false }]}]}
          bot.createMessage(channel, newMsgObject, {file: buf, name: user+'-expand.png'}).then().catch(err=>log(err))
        })
      })
      timeEnd('expand image')
    })
    .catch(err=>log(err))
}

const help=async(channel)=>{
  var helpTitles=['let\'s get wierd','help me help you','help!','wait, what ?']
  shuffle(helpTitles)
  var helpMsgObject={
  content: '',
  embeds: [
    {
      type: 'rich',
      title: helpTitles[0],
      //description: '```diff\n-| To create art: \n /dream\n !dream *your idea here*\n /random\n\n-| For text overlays / memes:\n /text\n !text words (reply to image result)\n\n-| Accounting:\n /balance\n /recharge\n !gift 10 @whoever\n\n-| Advanced customisation:\n /models\n /embeds\n !randomisers\n\n+| See these link buttons below for more commands and info\n```',
      description: '```diff\n-| To create art: \n+| /dream\n+| !dream *your idea here*\n+| /random\n\n-| For text overlays & memes:\n+| /text\n+| !text words (reply to image result)\n\n-| Accounting:\n+| /balance\n+| /recharge\n+| !gift 10 @whoever\n\n-| Advanced customisation:\n+| /models\n+| /embeds\n+| !randomisers\n``` ```yaml\nSee these link buttons below for more commands and info```',
      color: getRandomColorDec()
    }
  ],
  components: [
    {type: 1, components:[
      {type: 2, style: 5, label: "Intro Post", url:'https://peakd.com/@ausbitbank/our-new-stable-diffusion-discord-bot', emoji: { name: 'hive', id: '1110123056501887007'}, disabled: false },
      {type: 2, style: 5, label: "Github", url:'https://github.com/ausbitbank/stable-diffusion-discord-bot', emoji: { name: 'Github', id: '1110915942856282112'}, disabled: false },
      {type: 2, style: 5, label: "Commands", url:'https://github.com/ausbitbank/stable-diffusion-discord-bot/blob/main/commands.md', emoji: { name: 'Book_Accessibility', id: '1110916595863269447'}, disabled: false },
      {type: 2, style: 5, label: "Invite to server", url:'https://discord.com/oauth2/authorize?client_id='+bot.application.id+'&scope=bot&permissions=124992', emoji: { name: 'happy_pepe', id: '1110493880304013382'}, disabled: false },
      {type: 2, style: 5, label: "Privacy Policy", url:'https://gist.github.com/ausbitbank/cd8ba9ea6aa09253fcdcdfad36b9bcdd', emoji: { name: '📜', id: null}, disabled: false },
    ]}
  ] 
  }
  bot.createMessage(channel, helpMsgObject).then().catch(err=>log(err))
}

const listModels=async(channel)=>{ // list available models
  if(!models)await socket.emit('requestSystemConfig')
  var newMsg=''
  if(models){
    newMsg='**'+Object.keys(models).length+' models available**\n:green_circle: =loaded in VRAM :orange_circle: =cached in RAM :red_circle: = unloaded\n'
    Object.keys(models).forEach((m)=>{
      switch(models[m].status){
        case 'not loaded':{newMsg+=':red_circle:';break}
        case 'cached':{newMsg+=':orange_circle:';break}
        case 'active':{newMsg+=':green_circle:';break}
      }
      newMsg+='`'+m+'`  '
      newMsg+=models[m].description+'\n'
      if(newMsg.length>=1500){try{chatChan(channel,newMsg);newMsg=''}catch(err){log(err)}}
    })
    if(newMsg!==''){try{chatChan(channel,newMsg)}catch(err){log(err)}}
  }
}

async function listEmbeds(channel){ // list available embeds
  socket.emit("getLoraModels")
  socket.emit("getTextualInversionTriggers")
  newMsg=':pill: Embeddings are a way to supplement the current model. Add them to the prompt.\n'
  if(lora&&lora.length>0){newMsg+='**LORA**:\nwithLora(loraname,weight)\n'+lora.join(' , ')+'\n'} // map(x=>`withLora(${x})`)
  if(ti&&ti.length>0){newMsg=newMsg+'**Textual inversions**:\n'+ti.join(' , ')+'\n Everything in https://huggingface.co/sd-concepts-library is also available'} // ti.map(x=>`\<${x}\>`)
  sliceMsg(newMsg).forEach((m)=>{try{bot.createMessage(channel, m)}catch(err){debugLog(err)}})
}

const nsfwjsClassify = async(buffer)=>{
//async function nsfwjsClassify(buffer) {
  if(!config.nsfwChecksEnabled) return false
  const nsfwjsmodel = await nsfwjs.load()
  var nsfwjstensor3d = await tf.node.decodeImage(buffer,3)// Image must be in tf.tensor3d format
  const nsfwjspredictions = await nsfwjsmodel.classify(nsfwjstensor3d)// you can convert image to tf.tensor3d with tf.node.decodeImage(Uint8Array,channels)
  nsfwjstensor3d.dispose() // Tensor memory must be managed explicitly (it is not sufficient to let a tf.Tensor go out of scope for its memory to be released).
  return nsfwjspredictions
}

const isImageNSFW = async(buffer)=>{
//async function isImageNSFW(buffer){
  if(!config.nsfwChecksEnabled) return false
  var thresholdPorn=config.nsfwPornThreshold||0.7
  var thresholdSexy=config.nsfwSexyThreshold||0.7
  var thresholdHentai=config.nsfwHentaiThreshold||0.7
  //var thresholdNeutral=0.7
  //var thresholdDrawing=0.7
  var predict = await nsfwjsClassify(buffer)
  debugLog(predict)
  if(predict&&predict.length>0){
    log('Image is '+predict[0].className+' with '+(predict[0].probability*100).toFixed(0)+'% confidence')
    var probabilityPorn = predict.find(p=>p.className==='Porn').probability
    if(probabilityPorn>thresholdPorn) return true
    var probabilitySexy = predict.find(p=>p.className==='Sexy').probability
    if(probabilitySexy>thresholdSexy) return true
    var probabilityHentai = predict.find(p=>p.className==='Hentai').probability
    if(probabilityHentai>thresholdHentai) return true
    return false
  }
}

meme = async(prompt,urls,userid,channel)=>{
//async function meme(prompt,urls,userid,channel){
  time('meme')
  params = prompt.split(' ')
  cmd = prompt.split(' ')[0]
  param = undefined
  switch(cmd){
    case 'blur':{var image=await jimp.read(urls[0]);image.blur(10);img=await image.getBufferAsync(jimp.MIME_PNG);break}
    case 'greyscale':{var image=await jimp.read(urls[0]);image.greyscale();img=await image.getBufferAsync(jimp.MIME_PNG);break}
    case 'invert':{var image=await jimp.read(urls[0]);image.invert();img=await image.getBufferAsync(jimp.MIME_PNG);break}
    case 'flip':{var image=await jimp.read(urls[0]);image.flip(false,true);img=await image.getBufferAsync(jimp.MIME_PNG);break}
    case 'mirror':{var image=await jimp.read(urls[0]);image.flip(true,false);img=await image.getBufferAsync(jimp.MIME_PNG);break}
    case 'rotate':{var image=await jimp.read(urls[0]);var rotatedeg=parseInt(prompt.split(' ')[1])||90;image.rotate(rotatedeg);img=await image.getBufferAsync(jimp.MIME_PNG);break}
    case 'animateseed':{
      time('animateseed')
      if(params.length<2){return} // bugfix crash on animateseed with no seed
      let urlseed=[] // prompt image urls
      let promptseed = [] // prompt texts
      let delay = parseInt(params[2])||1000 // delay between frames
      // If command was replying to an image, consider that our stopping point.
      // So collect every image url for seed until we reach that end point
      var donemark = false // did we hit the last frame
      var stopUrl = null // image url that is our last frame to animate
      if (urls && urls.length > 0) { stopUrl = urls[0].split('/')[urls[0].split('/').length-1] }
      queue.filter((j)=>j.seed==params[1]).slice(-1 * maxAnimateImages).forEach((j) => { // Use slice to cap maximum frames, preferring more recent images
        j.results.forEach((r) => {
          // TODO: early exit feels awkward, maybe just do a normal loop with break?
          if (donemark) {return} // We're stopping early
          fileOnly = r.url.replace('outputs/','')
          if (stopUrl == fileOnly) {donemark=true} // this is the last one
          var seedUrl = config.basePath+fileOnly // TODO: Review OS compat path operations
          urlseed.push(seedUrl)
          //promptseed.push(r.metadata.image.prompt[0].prompt) // broken original
          promptseed.push(r.metadata.image.prompt) // invoke metadata format changed since initial implementation
        })
      })
      if (urlseed.length>1) // At least two images to work with
      {
        let styledprompts = [promptseed[0]] // prefill first prompt
        for (var i = 1; i < promptseed.length;i++) // start on second prompt
        {
          try{
            const diff = Diff.diffWords(promptseed[i - 1], promptseed[i]) // Find differences between previous prompt and this one, Chunks into unchanged/added/removed
            var updateprompt = ""
            diff.forEach((part) => { // Bring all chunks back together with styling based on type
              var pv = part.value.replaceAll('&','').replaceAll('<','‹').replaceAll('>','›').replaceAll('[','\[').replaceAll(']','\]') // Remove textual inversion brackets before adding markup
              // todo still failing on prompts with [<neg-sketch-3>] due to invalid markup
              if (part.added) {updateprompt += "<span foreground='green'><b><big>" + pv + "</big></b></span>"}
              else if (part.removed) {updateprompt += "<span foreground='red'><s>" + pv + "</s></span>"}
              else {updateprompt += pv}
            })
            styledprompts.push(updateprompt)
          }catch(err){log(err)}
        }
        // TODO: Better finisher ideas? Repeating last prompt in blue to signify the end
        styledprompts.push("<span foreground='blue'>" + promptseed[promptseed.length-1] + "</span>")
        urlseed.push(urlseed[urlseed.length - 1])
      	let frameList = []
      	for (var i = 0;i < urlseed.length;i++)
      	{
      		var res = await sharp(urlseed[i]).extend({bottom: 200,background: 'white'}) // Add blank area for prompt text at bottom
          res = sharp(await res.toBuffer()) // metadata will give wrong height value after our extend, reload it. Not too expensive
          var metadata = await res.metadata()
          // Create styled prompt text overlay
          // TODO: Some height padding would be nice. Not as easy as width padding cuz of alignment
          // WARN: Had no issue with font, but read about extra steps sometimes being necessary
          var sanitizedprompt = styledprompts[i]? styledprompts[i] : ''
          if(sanitizedprompt){
            try{
              const overlay = await sharp({text: {text: sanitizedprompt,rgba: true,width: metadata.width - 20,height: 200,font: 'Arial',}}).png().toBuffer()
              res = await res.composite([{ input: overlay, gravity: 'south' }]) // Combine the prompt overlay with prompt image
              frameList.push(res)
            }catch(err){log(err)}
          }
      	}
        // rgb444 format is way faster, slightly worse quality
        // default takes almost a minute for 15 frames, versus a handful of seconds
        // Does makes background a bit off-white sometimes
        try{
          var image = await GIF.createGif({delay:delay, format:"rgb444"}).addFrame(frameList).toSharp()
          img = await image.toBuffer()
        }catch(err){log(err)}
      }
      timeEnd('animateseed')
      break
    }
    case 'animate':
    case 'blink': {
      if (urls.length>1){
        let delay = parseInt(params[1]) || 1000 // delay between frames
        frameList = []
        try {
          for (var i = 0; i < urls.length;i++){const input = (await axios({ url: urls[i], responseType: "arraybuffer" })).data;frameList.push(sharp(input))}
          var image = await GIF.createGif({delay:delay,format:"rgb444"}).addFrame(frameList).toSharp()
          img = await image.toBuffer()
        }catch(err){console.error(err)}
      }
      break
    }
    /*
    case 'sepia': var img = await new DIG.Sepia().getImage(urls[0]);break
    case 'circle': var img = await new DIG.Circle().getImage(urls[0]);break
    case 'color': var img = await new DIG.Color().getImage(params[1]);break // take hex color code*/
  }
  try{
    if(img&&cmd){
      var msg = '<@'+userid+'> used `!meme '+prompt+'`'
      if (!creditsDisabled){
        chargeCredits(userid,0.05)
        msg+=', it cost :coin:`0.05`/`'+creditsRemaining(userid)+'`'
      }
      var extension = ['blink','triggered','animate','animateseed'].includes(cmd) ? '.gif' : '.png'
      bot.createMessage(channel, msg, {file: img, name: cmd+'-'+getRandomSeed()+extension})
    }
  }catch(err){debugLog(err)}
  timeEnd('meme')
}
meme=debounce(meme,1000,true)
function shuffle(array) {for (let i = array.length - 1; i > 0; i--) {let j = Math.floor(Math.random() * (i + 1));[array[i], array[j]] = [array[j], array[i]]}} // fisher-yates shuffle
const unique = (value, index, self) => { return self.indexOf(value) === index }
const getRandomColorDec=()=>{return Math.floor(Math.random()*16777215)}
const timeDiff=(date1,date2)=>{return date2.diff(date1, 'seconds')}
const getRandom=(what)=>{
  if(randoms.includes(what)){
    try{
      var lines=randomsCache[randoms.indexOf(what)]
      return lines[Math.floor(Math.random()*lines.length)]
    }catch(err){log(err)}
  }else{return what}
}
const replaceRandoms=(input)=>{
  var output=input
  randoms.forEach(x=>{
    var wordToReplace='{'+x+'}'
    var before='';var after='';var replacement=''
    var wordToReplaceLength=wordToReplace.length
    var howManyReplacements=output.split(wordToReplace).length-1 // todo can we improve this?
    for (let i=0;i<howManyReplacements;i++){ // to support multiple {x} of the same type in the same prompt
      var wordToReplacePosition=output.indexOf(wordToReplace) // where the first {x} starts (does this need +1?)
      if (wordToReplacePosition!==-1&&wordToReplacePosition > 0 && wordToReplacePosition < output.length - wordToReplaceLength){ // only continue if a match was found
        var wordToReplacePositionEnd=wordToReplacePosition+wordToReplaceLength
        before=output.substr(0,wordToReplacePosition)
        replacement=getRandom(x)
        after=output.substr(wordToReplacePositionEnd)
        output=before+replacement+after
      } else if (wordToReplacePosition === 0) {
        replacement = getRandom(x)
        output = replacement + output.substr(wordToReplaceLength)
      } else if (wordToReplacePositionEnd === output.length) {
        output = output.substr(0, wordToReplacePositionEnd - wordToReplaceLength) + getRandom(x)
      }
    }
  })
  return output
}

const partialMatches=(strings,search)=>{
  let results = []
  for(let i=0;i<strings.length;i++){if(searchString(strings[i], search)){results.push(strings[i])}}
  return results 
} 

const searchString=(str,searchTerm)=>{
  let searchTermLowerCase = searchTerm.toLowerCase() 
  let strLowerCase = str.toLowerCase() 
  return strLowerCase.includes(searchTermLowerCase) 
}
const metaDataMsg=async(imageurl,channel)=>{
//async function metaDataMsg(imageurl,channel){
  debugLog('attempting metadata extraction from '+imageurl)
  try{var metadata = await ExifReader.load(imageurl)
  }catch(err){log(err)}
  var newMsg='Metadata for '+imageurl+' \n'
  Object.keys(metadata).forEach((t)=>{
    newMsg+='**'+t+'**:'
    Object.keys(metadata[t]).forEach((k)=>{
      if(k==='description'&&metadata[t][k]===metadata[t]['value']){
      } else {
        if(k==='value'){newMsg+='`'+metadata[t][k]+'`'}
        if(k==='description'){newMsg+=' *'+metadata[t][k]+'*'}
      }
    })
    newMsg+='\n'
  })
  if(newMsg.length>0&&newMsg.length<10000){sliceMsg(newMsg).forEach((m)=>{try{bot.createMessage(channel, m)}catch(err){debugLog(err)}})} else {debugLog('Aborting metadata message, response too long')}
}

const processFile=async(file)=>{// Monitor new files entering watchFolder, post image with filename.
  if (file.endsWith('.png')||file.endsWith('jpg')){
    await fsPromises.readFile(file)
      .then(data=>{
        filename=file.replace(basePath, "").replace(".png","").replace(".jpg","")
        msg=':file_cabinet:'+filename
        bot.createMessage(config.channelID, msg, {file: data, name: filename }).then().catch(err=>{log(err)})
      })
      .catch(err=>{log(err)})
  }
}
if(config.filewatcher==="true") {
  const renders=chokidar.watch(config.watchFolder, {persistent: true,ignoreInitial: true,usePolling: false,awaitWriteFinish:{stabilityThreshold: 500,pollInterval: 500}})
  renders.on('add',file=>{processFile(file)})
}
const tidyNumber=(x)=>{if(x){var parts=x.toString().split('.');parts[0]=parts[0].replaceAll(/\B(?=(\d{3})+(?!\d))/g, ',');return parts.join('.')}else{return null}}
const sliceMsg=(str)=>{
  const chunkSize=1999
  let chunks=[];let i=0;let len=str.length
  while(i<len){chunks.push(str.slice(i,i+=chunkSize))}
  return chunks
}
const sliceMsg2=(str)=>{
  const chunkSize=1999
  let chunks=[];let i=0;let len=str.length
  while(i<len){
    let chunk=str.slice(i,i+chunkSize)
    let lastNewlineIndex=chunk.lastIndexOf('\n')
    if(lastNewlineIndex!==-1&&chunkSize-lastNewlineIndex<=40){
      chunks.push(chunk.slice(0,lastNewlineIndex))
      i+=lastNewlineIndex+1
    }else{
      chunks.push(chunk)
      i+=chunkSize
    }
  }
  return chunks
}
const clearParent=async(interaction)=>{
  var label=':saluting_face: **'+interaction.data.custom_id.split('-')[0].replace('twk','')+'** selected'
  try{
    if(interaction?.message?.flags){// ephemeral message that cannot be deleted by us, only edited
      try{return await interaction.editParent({content: label,components: [],embeds:[]}).then(()=>{}).catch(e=>{if(e){}})}catch(err){log(err)}
    } else if (interaction.message) { // regular message reference
      try{await interaction.createMessage({content:label,flags:64}).then(()=>{}).catch(e=>{if(e){}})}catch(err){log(err)}
    }
  }catch(err){log(err)}
}
const viewQueue=()=>{ // admin function to view queue data
  time('viewQueue')
  var queueNew=queue.filter((q)=>q.status==='new')
  var queueRendering=queue.filter((q)=>q.status==='rendering')
  var queueFailed=queue.filter((q)=>q.status==='failed')
  var queueCancelled=queue.filter((q)=>q.status==='cancelled')
  var queueDone=queue.filter((q)=>q.status==='done')
  var msg='**Queue Stats:**\n`'+queueNew.length+'` pending, `'+queueRendering.length+'` rendering, `'+queueFailed.length+'` failed, `'+queueCancelled.length+'` cancelled, `'+tidyNumber(queueDone.length)+'` done\n'
  queueRendering.forEach((q)=>{msg+=':fire: JobId `'+q.id+'` rendering for `'+q.username+'` userid `'+q.userid+'`\nPrompt: `'+q.prompt+'`\n'})
  queueNew.forEach((q)=>{msg+=':clock1: JobId `'+q.id+'` pending for `'+q.username+'` userid `'+q.userid+'`\nPrompt: `'+q.prompt+'`\n'})
  msg+='```yaml\n!cancel                 to cancel the current render\n!canceljob jobid        to cancel a specific job id\n!canceluser userid      to cancel all jobs from that user id\n```'
  //var components=[{type:1,components:[{type:2,label:'Refresh',custom_id:'viewQueue',emoji:{name:'🔄',id:null},disabled:false}]}]
  sliceMsg(msg).forEach((m)=>{try{directMessageUser(config.adminID, {content:m})}catch(err){debugLog(err)}})
  timeEnd('viewQueue')
}
const cancelCurrentRender=()=>{
  log('Cancelling current render'.bgRed)
  queue[queue.findIndex((q)=>q.status==='rendering')-1].status='cancelled'
  socket.emit('cancel')
  rendering=false
}

const cancelJob=(jobid)=>{
  var job=queue[jobid]
  log('Cancelling job '+jobid.bgRed)
  //if(job&&['rendering'].includes(job.status)){socket.emit('cancel')}
  if(job&&['new','rendering'].includes(job.status)){job.status='cancelled'}
  dbWrite()
}

const cancelUser=(userid)=>{
  log('Cancelling user jobs '+userid.bgRed)
  var jobs=queue.filter((q)=>q.userid===userid)
  jobs?.forEach((j)=>{
    //if(['rendering'].includes(j.status)){socket.emit('cancel')}
    if(['new','rendering'].includes(j.status)){j.status='cancelled'}
  })
  dbWrite()
}

const isPromptSFW=(prompt)=>{
  if(!prompt)return true
  var isSFW=true
  nsfwWords.forEach(w=>{
    prompt = prompt.replaceAll('['+w+']','') // remove negative terms that would match
    if(prompt.toLowerCase().includes(w)){isSFW=false}
  })
  return isSFW
}

const makePromptSFW=(prompt)=>{ 
  time('makePromptSFW')
  if(!prompt)return ''
  if(nsfwWords.length===0) return prompt
  var newPrompt=prompt
  var nsfwWordsRegex = new RegExp('\\b(' + nsfwWords.join('|') + ')', 'g')
  var nwords = newPrompt.match(nsfwWordsRegex)
  if(nwords?.length>0){nwords.forEach((w)=>{newPrompt = newPrompt.replaceAll('['+w+']','').replaceAll(w,'['+w+']')})} // remove term from orig prompt, replace with negative
  timeEnd('makePromptSFW')
  return newPrompt
}

// Initial discord bot setup and listeners
bot.on("ready", async () => {
  log("Connected to discord".bgGreen)
  log('Invite bot to server: https://discord.com/oauth2/authorize?client_id='+bot.application.id+'&scope=bot&permissions=124992')
  log("Guilds:".bgGreen+' '+bot.guilds.size)
  log('Queue db: '+tidyNumber(queue.length)+' , Users: '+users.length+' , Payments: '+payments.length)
  processQueue()
  bot.getCommands().then(cmds=>{ // check current commands setup, update if needed
    bot.commands = new Collection()
    for (const c of slashCommands) {
      if(cmds.filter(cmd=>cmd.name===c.name).length>0) {
        bot.commands.set(c.name, c) // needed ?
      } else {
        log('Slash command '+c.name+' is unregistered, registering')
        bot.commands.set(c.name, c)
        bot.createCommand({name: c.name,description: c.description,options: c.options ?? [],type: Constants.ApplicationCommandTypes.CHAT_INPUT})
      }
    }
  })
  if (config.hivePaymentAddress.length>0){checkNewPayments()}
})

bot.on("interactionCreate", async (interaction) => {
  if(interaction instanceof Eris.CommandInteraction && authorised(interaction,interaction.channel.id,interaction.guildID)) {//&& interaction.channel.id === config.channelID
    if (!bot.commands.has(interaction.data.name)) return interaction.createMessage({content:'Command does not exist', flags:64}).catch((e) => {log('command does not exist'.bgRed);log(e)})
    try {
      await interaction.acknowledge().then(()=>{
        bot.commands.get(interaction.data.name).execute(interaction)
        interaction.deleteMessage('@original').then(()=>{}).catch((e)=>log(e))
      }).catch((err)=>log(err))
    }
    catch (error) { console.error(error); await interaction.createMessage({content:'There was an error while executing this command!', flags: 64}).catch((e) => {log(e)}) }
  }
  if((interaction instanceof Eris.ComponentInteraction||interaction instanceof Eris.ModalSubmitInteraction)&&authorised(interaction,interaction.channel.id,interaction.guildID)) {
    if(!interaction.member){interaction.member={user:{id: interaction.user.id,username:interaction.user.username,bot:interaction.user.bot}}}
    var cid=interaction.data.custom_id 
    var id=cid.split('-')[1]
    var rn=cid.split('-')[2]
    log(cid.bgCyan.black+' request from '+interaction.member.user.username.bgCyan.black)
    if(!cid.startsWith('edit')){try{await interaction.deferUpdate()}catch(err){log(err)}} // ack all non modal dialogs
    if(queue.length>=(id-1)){var newJob=JSON.parse(JSON.stringify(queue[id-1]))} // parse/stringify to deep copy and make sure we dont edit the original}
    if(newJob){
      newJob.number=1
      if(newJob.webhook){delete newJob.webhook}
      var result=newJob.results[rn]
      if(result&&result.metadata.image&&result.metadata.image.seed){newJob.seed=result.metadata.image.seed}
      newJob.results=[]
    }
    if(cid.startsWith('random')){
      request({cmd: getRandom('prompt'), userid: interaction.member.user.id, username: interaction.member.user.username, bot: interaction.member.user.bot, channelid: interaction.channel.id,guildid:interaction.guildID?interaction.guildID:undefined, attachments: []})
      return clearParent(interaction) //return interaction.editParent({}).catch((e)=>{log(e)})
    }else if(cid.startsWith('refresh')){
      //try{await interaction.deferUpdate()}catch(err){log(err)}
      if(newJob) {
        if (cid.startsWith('refreshVariants')&&newJob.sampler!=='k_euler_a') { // variants do not work with k_euler_a sampler
          newJob.variation_amount=0.1
          newJob.seed = cid.split('-')[2]
          var variantseed = cid.split('-')[3]
          if (variantseed){ // variant of a variant
            newJob.with_variations = [[parseInt(variantseed),0.1]]
            //log(newJob.with_variations)
          }
        } else if (cid.startsWith('refreshUpscale-')) {
          newJob.upscale_level = 2
          newJob.seed = cid.split('-')[2]
          newJob.variation_amount=0
        } else if (cid.startsWith('refreshEdit-')){
          newJob.prompt=interaction.data.components[0].components[0].value
        } else { // Only a normal refresh should change the seed
          newJob.variation_amount=0
          newJob.seed=getRandomSeed()
        }
        request({cmd: getCmd(newJob), userid: interaction.member.user.id, username: interaction.member.user.username, bot: interaction.member.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID ? interaction.guildID : undefined, attachments: newJob.attachments})
        return clearParent(interaction)
      } else {
        log('unable to refresh render'.bgRed)
        // todo need better response when job is found (db rollback)
        // find msg id reference, find image, download image, pull metadata, reconstruct job from meta and resubmit
        //log(interaction.message.attachments[0].proxy_url)
        msgToJob(interaction.message)
        return clearParent(interaction)
      }
    } else if (cid==='viewQueue') {
      viewQueue()
    } else if (cid.startsWith('editExpandDirection-')){
      msgid=cid.split('-')[3]
      return interaction.createModal({custom_id:'twkexpand-'+id+'-'+rn+'-'+msgid,title:'out/up/right/down/left/horizontal/vertical',components:[{type:1,components:[{type:4,custom_id:'direction',label:'Direction',style:2,value:'out',required:true}]}]}).then((r)=>{clearParent(interaction)}).catch((e)=>{log(e)})
    } else if (cid.startsWith('editExpandAmount-')){
      msgid=cid.split('-')[3]
      direction=parseInt(interaction.data.components[0].components[0].value)
      return interaction.createModal({custom_id:'twkexpand-'+id+'-'+rn+'-'+msgid+'-'+direction,title:'Edit the amount to expand in pixels',components:[{type:1,components:[{type:4,custom_id:'amount',label:'Amount to expand in pixels',style:2,value:225,required:true}]}]}).then((r)=>{}).catch((e)=>{log(e)})
    } else if (cid.startsWith('editRandom-')) {
      if(newJob){return interaction.createModal({custom_id:'refreshEdit-'+newJob.id,title:'Edit the random prompt?',components:[{type:1,components:[{type:4,custom_id:'prompt',label:'Prompt',style:2,value:getRandom('prompt'),required:true}]}]}).then((r)=>{}).catch((e)=>{log(e)})
      }else{log('edit request failed'.bgRed);return clearParent(interaction)}
    } else if (cid.startsWith('edit-')) {
      if(newJob){
        return interaction.createModal({custom_id:'refreshEdit-'+newJob.id,title:'Edit the prompt',components:[{type:1,components:[{type:4,custom_id:'prompt',label:'Prompt',style:2,value:newJob.prompt,required:true}]}]}).then((r)=>{}).catch((e)=>{log(e)})
      }else{log('edit request failed'.bgRed);return clearParent(interaction)}
    } else if (cid.startsWith('editSteps-')) {
      if(newJob){
        return interaction.createModal({custom_id:'twksteps-'+newJob.id,title:'Edit the steps (Max '+maxSteps+')',components:[{type:1,components:[{type:4,custom_id:'steps',label:'Steps',style:2,value:newJob.steps,required:true,min_length:1,max_length:3}]}]}).then((r)=>{}).catch((e)=>{console.error(e)})
      }else{return clearParent(interaction)}
    } else if (cid.startsWith('editScale-')) {
      if(newJob){
        return interaction.createModal({custom_id:'twkscale-'+newJob.id,title:'Edit the scale',components:[{type:1,components:[{type:4,custom_id:'scale',label:'Scale',style:2,value:String(newJob.scale),required:true,min_length:1,max_length:4}]}]}).then((r)=>{return clearParent(interaction)}).catch((e)=>{console.error(e)})
      }else{return clearParent(interaction)}
    } else if (cid.startsWith('editRotate-')) {
      if(newJob){
        msgid=cid.split('-')[3]
        return interaction.createModal({custom_id:'twkrotate-'+id+'-'+rn+'-'+msgid,title:'Rotate the image',components:[{type:1,components:[{type:4,custom_id:'degrees',label:'Rotate this many degrees',style:2,value:90,required:true,min_length:1,max_length:3}]}]}).then((r)=>{return clearParent(interaction)}).catch((e)=>{console.error(e)})
      }else{return clearParent(interaction)}
    } else if (cid.startsWith('editStrength-')) {
      if(newJob){
        return interaction.createModal({custom_id:'twkstrength-'+newJob.id,title:'Edit the strength',components:[{type:1,components:[{type:4,custom_id:'strength',label:'Strength',style:2,value:String(newJob.strength),required:true,min_length:1,max_length:4}]}]}).then((r)=>{return clearParent(interaction)}).catch((e)=>{console.error(e)})
      }else{return clearParent(interaction)}
    } else if (cid.startsWith('editResolution-')) {
      if(newJob){
        return interaction.createModal({custom_id:'twkresolution-'+newJob.id,title:'Edit the resolution',components:[{type:1,components:[{type:4,custom_id:'resolution',label:'Resolution',style:2,value:String(newJob.width+'x'+newJob.height),required:true,min_length:5,max_length:12}]}]}).then((r)=>{return clearParent(interaction)}).catch((e)=>{console.error(e)})
      }else{return clearParent(interaction)}
    } else if (cid.startsWith('editText-')) {
      msgid=cid.split('-')[3]
      return interaction.createModal({custom_id:'twktext-'+id+'-'+rn+'-'+msgid,title:'Add text',components:[{type:1,components:[{type:4,custom_id:'twktext-'+id+'-'+rn+'-'+msgid,label:'Text to overlay on image',style:2,value:String(''),required:true,min_length:0,max_length:200}]}]}).then((r)=>{return clearParent(interaction)}).catch((e)=>{console.error(e)})
    } else if (cid.startsWith('tweak-')) {
      if (newJob) {
        var tweakResponse=          {
            content:':test_tube: **Tweak Menu**',
            flags:64,
            components:[
              {type:1,components:[
                {type: 2, style: 1, label: "Aspect Ratio", custom_id: "chooseAspect-"+id+'-'+rn, emoji: { name: '📐', id: null}, disabled: false },
                {type: 2, style: 1, label: "Models "+Object.keys(models).length, custom_id: "chooseModel-"+id+'-'+rn, emoji: { name: '💾', id: null}, disabled: false },
                {type: 2, style: 1, label: "Textual Inversions "+ti.length, custom_id: "chooseTi-"+id+'-'+rn, emoji: { name: '💊', id: null}, disabled: false },
                {type: 2, style: 1, label: "Loras "+lora.length, custom_id: "chooseLora-"+id+'-'+rn, emoji: { name: '💊', id: null}, disabled: false },
                //{type: 2, style: 1, label: "Embeds", custom_id: "chooseEmbeds-"+id+'-'+rn, emoji: { name: '💊', id: null}, disabled: false } // todo Only push if lora+ti count is below 100, remove textual inversion and lora buttons in this case
              ]},
              {type:1,components:[
                {type: 2, style: 2, label: "Resolution", custom_id: "editResolution-"+id+'-'+rn, emoji: { name: '📏', id: null}, disabled: false },
                {type: 2, style: 2, label: "Scale", custom_id: "editScale-"+id+'-'+rn, emoji: { name: '⚖️', id: null}, disabled: false },
                {type: 2, style: 2, label: "Steps", custom_id: "editSteps-"+id+'-'+rn, emoji: { name: '♻️', id: null}, disabled: false },
                {type: 2, style: 2, label: "Strength", custom_id: "editStrength-"+id+'-'+rn, emoji: { name: '💪', id: null}, disabled: false },
                {type: 2, style: 2, label: "Sampler", custom_id: "chooseSampler-"+id+'-'+rn, emoji: { name: '👁️', id: null}, disabled: false }
              ]},
              {type:1,components:[
                {type: 2, style: 4, label: "Upscale 2x", custom_id: "twkupscale2-"+id+'-'+rn, emoji: { name: '🔍', id: null}, disabled: newJob.upscale_level===0||false },
                {type: 2, style: 4, label: "Upscale 4x", custom_id: "twkupscale4-"+id+'-'+rn, emoji: { name: '🔎', id: null}, disabled: newJob.upscale_level===0||false },
                {type: 2, style: 4, label: "Face Fix GfpGAN", custom_id: "twkgfpgan-"+id+'-'+rn, emoji: { name: '💄', id: null}, disabled: newJob.gfpgan_strength!==0||false },
                {type: 2, style: 4, label: "Face Fix CodeFormer", custom_id: "twkcodeformer-"+id+'-'+rn, emoji: { name: '💄', id: null}, disabled: newJob.codeformer_strength!==0||false },
                {type: 2, style: 4, label: "High Resolution Fix", custom_id: "twkhiresfix-"+id+'-'+rn, emoji: { name: '🔭', id: null}, disabled: newJob.hires_fix||false }
              ]},
              {type:1,components:[
                {type: 2, style: 2, label: "1% variant", custom_id: "twkvariant1-"+id+'-'+rn, emoji: { name: '🧬', id: null}, disabled: false },
                {type: 2, style: 2, label: "5% variant", custom_id: "twkvariant5-"+id+'-'+rn, emoji: { name: '🧬', id: null}, disabled: false },
                {type: 2, style: 2, label: "10% variant", custom_id: "twkvariant10-"+id+'-'+rn, emoji: { name: '🧬', id: null}, disabled: false },
                {type: 2, style: 2, label: "25% variant", custom_id: "twkvariant25-"+id+'-'+rn, emoji: { name: '🧬', id: null}, disabled: false },
                {type: 2, style: 2, label: "50% variant", custom_id: "twkvariant50-"+id+'-'+rn, emoji: { name: '🧬', id: null}, disabled: false }
              ]},
              {type:1,components:[
                {type: 2, style: 2, label: "Default settings", custom_id: "twkdefault-"+id+'-'+rn, emoji: { name: '☢️', id: null}, disabled: false },
                {type: 2, style: 2, label: "Fast settings", custom_id: "twkfast-"+id+'-'+rn, emoji: { name: '⏩', id: null}, disabled: false },
                {type: 2, style: 2, label: "Slow settings", custom_id: "twkslow-"+id+'-'+rn, emoji: { name: '⏳', id: null}, disabled: false },
                {type: 2, style: 2, label: "Batch of 5", custom_id: "twkbatch5-"+id+'-'+rn, emoji: { name: '🖐️', id: null}, disabled: false },
                {type: 2, style: 1, label: "More Options", custom_id: "tweakmore-"+id+'-'+rn+'-'+interaction.message.id, emoji: { name: '🚪', id: null}, disabled: false }
              ]}
            ]
          }
        return interaction.createMessage(tweakResponse).then((r)=>{}).catch((e)=>{console.error(e)})
      } else {console.error('Edit request failed');return clearParent(interaction)}
    } else if (cid.startsWith('tweakmore-')) {
      msgid=cid.split('-')[3]
      if (newJob) {
        var tweakResponse=          {
            content:':door: **More Options**',
            flags:64,
            components:[
              {type:1,components:[
                {type: 2, style: 1, label: "Remove Background", custom_id: "twkbackground-"+id+'-'+rn+'-'+msgid, emoji: { name: '🪄', id: null}, disabled: false },
                {type: 2, style: 1, label: "Text Overlay", custom_id: "editText-"+id+'-'+rn+'-'+msgid, emoji: { name: '💬', id: null}, disabled: false },
                {type: 2, style: 1, label: "Rotate", custom_id: "editRotate-"+id+'-'+rn+'-'+msgid, emoji: { name: '🔄', id: null}, disabled: false },
                {type: 2, style: 1, label: "Expand Canvas", custom_id: "editExpandDirection-"+id+'-'+rn+'-'+msgid, emoji: { name: '🪄', id: null}, disabled: false },
                {type: 2, style: 1, label: "Seamless Tiling", custom_id: "twkseamless-"+id+'-'+rn, emoji: { name: '🪢', id: null}, disabled: false },
              ]}
            ]
          }
        return interaction.createMessage(tweakResponse).then((r)=>{clearParent(interaction)}).catch((e)=>{console.error(e)})
      } else {log('Edit request failed');return clearParent(interaction)}
    } else if (cid.startsWith('twk')) {
      var newCmd=''
      var postProcess=false
      switch(cid.split('-')[0].replace('twk','')){
        case 'scalePlus': newJob.scale=newJob.scale+1;break
        case 'scaleMinus': newJob.scale=newJob.scale-1;break
        case 'scale': var newscale=parseFloat(interaction.data.components[0].components[0].value);if(!isNaN(newscale)){newJob.scale=newscale};break
        case 'steps': var newsteps=parseInt(interaction.data.components[0].components[0].value);if(!isNaN(newsteps)){newJob.steps=newsteps};break
        case 'strength': var newstrength=parseFloat(interaction.data.components[0].components[0].value);if(!isNaN(newstrength)){newJob.strength=newstrength};break
        case 'aspectPortrait': newJob.height=defaultSize+192;newJob.width=defaultSize;break
        case 'aspectLandscape': newJob.width=defaultSize+192;newJob.height=defaultSize;break
        case 'aspectSquare': newJob.width=defaultSize;newJob.height=defaultSize;break
        case 'resolution': try{var newres=interaction.data.components[0].components[0].value.split('x');newJob.width=parseFloat(newres[0]);newJob.height=parseFloat(newres[1])}catch(err){log(err)};break
        case 'aspect4k': newJob.width=960;newJob.height=512;newJob.upscale_level=4;newJob.hires_fix=true;break
        case 'upscale2': newJob.upscale_level=2;break // currently resubmitting jobs, update to use postprocess once working
        case 'upscale4': newJob.upscale_level=4;break
        case 'variant1': newJob.variation_amount=0.01;break
        case 'variant5': newJob.variation_amount=0.05;break
        case 'variant10': newJob.variation_amount=0.1;break
        case 'variant25': newJob.variation_amount=0.25;break
        case 'variant50': newJob.variation_amount=0.50;break
        case 'hiresfix': newJob.hires_fix=true;break
        case 'upscale2': newJob.upscale_level=2;break // All of these should be migrated to the postProcess function once working, faster/cheaper
        case 'upscale4': newJob.upscale_level=4;break //
        case 'gfpgan': newJob.gfpgan_strength=0.8;newJob.codeformer_strength=0;break //
        case 'codeformer': newJob.codeformer_strength=0.8;newJob.gfpgan_strength=0;break //
        case 'default': newCmd=newJob.prompt;break
        case 'fast': newJob.steps=20;break
        case 'slow': newJob.steps=50;break
        case 'batch5': newJob.seed=getRandomSeed();newJob.number=5;break
        case 'seamless': newJob.seamless=newJob.seamless?!newJob.seamless:true;break // toggle seamless tiling
        case 'rotate': {
          bot.getMessage(interaction.channel.id, interaction.data.custom_id.split('-')[3]).then((msg) => {
            try{rotate(msg.attachments[0].proxy_url,parseInt(interaction.data.components[0].components[0].value),interaction.channel.id,interaction.member.id)}catch(err){log(err)}
          }).catch((err)=>{log(err)})
          break
        }
        case 'inpaint': {
          var userid=interaction.member.id ? interaction.member.id : interaction.user.id
          var username=interaction.member.user ? interaction.member.user.username : interaction.user.username
          var guild=interaction.guildID?interaction.guildID:undefined
          try{inpaint(interaction.message.attachments,defaultInpaintPrompt,interaction.channel.id,userid,username,guild)}catch(err){log(err)}
          break
        }
        case 'expand': {
          //var direction=interaction.custom_id.split('-')[4]
          var direction=interaction.data.components[0].components[0].value
          var amount=256
          var msgid=interaction.data.custom_id.split('-')[3]
          bot.getMessage(interaction.channel.id, msgid).then((msg) => {
            try{expand(msg.attachments[0].proxy_url,direction,amount,interaction.channel.id,interaction.member.id,msgid)}catch(err){log(err)}
          }).catch((err)=>{log(err)})
          break
        }
        case 'background':{
          var msgid=interaction.data.custom_id.split('-')[3]
          var userid=interaction.member.id ? interaction.member.id : interaction.user.id
          bot.getMessage(interaction.channel.id, msgid).then((msg) => {
            try{removeBackground(msg.attachments[0].proxy_url,interaction.channel.id,userid)}catch(err){log(err)}
          }).catch((err)=>{log(err)})
          break}
        case 'text':{
          bot.getMessage(interaction.channel.id, interaction.data.custom_id.split('-')[3]).then((msg) => {textOverlay(msg.attachments[0].proxy_url,interaction.data.components[0].components[0].value,'south',interaction.channel.id,interaction.member.id)}).catch((err) => {log(err)})
          break
        }
      }
      if (postProcess){ // submit as postProcess request
        //todo
      } else if (interaction.data.custom_id.startsWith('twkbackground')||interaction.data.custom_id.startsWith('twktext')||interaction.data.custom_id.startsWith('twkrotate')||interaction.data.custom_id.startsWith('twkexpand')||interaction.data.custom_id.startsWith('twkinpaint')){
        // dont submit as new job
      } else { // submit as new job with changes
        if(newCmd===''){newCmd=getCmd(newJob)}
        if (interaction.member) {
          request({cmd: newCmd, userid: interaction.member.user.id, username: interaction.member.user.username, bot: interaction.member.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID?interaction.guildID:undefined, attachments: newJob.attachments})
        } else if (interaction.user){
          request({cmd: newCmd, userid: interaction.user.id, username: interaction.user.username, bot: interaction.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID?interaction.guildID:undefined, attachments: newJob.attachments})
        }
      }
      return clearParent(interaction)
      //return interaction.editParent({content:':test_tube: **'+interaction.data.custom_id.split('-')[0].replace('twk','')+'** selected',components:[]}).catch(e=>{debugLog(e)})
    } else if (interaction.data.custom_id.startsWith('chooseModel')) {
      if(newJob&&models){
        var changeModelResponse={content:':floppy_disk: **Model Menu**\nUse this menu to change the model/checkpoint being used, to give your image a specific style',flags:64,components:[]}
        var allModelKeys=Object.keys(models)
        var page = interaction.data.custom_id.split('-').length===4 ? parseInt(interaction.data.custom_id.split('-')[3]) : 0 // get page number from id
        var batch = page===0 ? allModelKeys.slice(0,99) : allModelKeys.slice(page+99,page+199) // split loras into batches of 100 and pick our page of data
        for(let i=0;i<batch.length;i+=25) {
          var batchSlice=batch.slice(i,i+25);var batchLabel=batchSlice[0][0]+' to '+batchSlice[batchSlice.length-1][0]
          changeModelResponse.components.push({type:1,components:[{type: 3,custom_id:'changeModel'+i+'-'+id+'-'+rn,placeholder:'Choose a model/checkpoint - '+batchLabel,min_values:1,max_values:1,options:[]}]})
          batch.slice(i,i+25).forEach((m)=>{changeModelResponse.components[changeModelResponse.components.length-1].components[0].options.push({label: m,value: m,description: models[m].description.substring(0,99)})})
        }
        if(allModelKeys.length>100){ // only show pages if needed
          changeEmbedResponse.components.push({type:1,components:[
            {type: 2, style: 1, label: 'Back', custom_id: 'chooseModel-'+id+'-'+rn+'-'+(page-1),value:page-1,emoji:{name:'⬅️',id:null},disabled:page===0},
            {type: 2, style: 2, label: 'Page: '+(page+1), custom_id: 'chooseModel-'+id+'-'+rn+'-'+(page),value:page,emoji:{ name:'📃',id:null},disabled:true},
            {type: 2, style: 1, label: 'More', custom_id: 'chooseModel-'+id+'-'+rn+'-'+(page+1),value:page+1,emoji:{name:'➡️',id:null},disabled:(page*200)>(allModelKeys.length)}
          ]})
        }
        return interaction.editParent(changeModelResponse).then((r)=>{}).catch((e)=>{console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('changeModel')) {
      var newModel=interaction.data.values[0]
      if (models[newModel]){
        var newModelDescription=models[newModel].description
        var newModelKeywords=newModelDescription.split('##')[1]
        var oldModel=newJob.model
        var oldModelDescription=models[oldModel].description
        var oldModelKeywords=oldModelDescription.split('##')[1]
      }
      if(newJob&&newModel&&models[newModel]){
        newJob.model=newModel // set the new model
        if(newModelKeywords&&!newJob.prompt.includes(newModelKeywords)){ //new model needs keywords not currently in the prompt
          if(newJob.prompt.includes(oldModelKeywords)){ // old model needed keywords that are still in the prompt
            newJob.prompt=newJob.prompt.replaceAll(oldModelKeywords,newModelKeywords) // swap new for old
          }else{newJob.prompt=newModelKeywords+','+newJob.prompt}// otherwise, just add new keywords
        }
        if (newJob.prompt.includes(oldModelKeywords)&&!newModelKeywords){newJob.prompt=newJob.prompt.replaceAll(oldModelKeywords+',','')}//Remove old keywords, even if we dont have new ones to replace
        var attach=[]
        if (newJob.attachments.length>0){attach=newJob.attachments}
        if(interaction.member){
          request({cmd: getCmd(newJob), userid: interaction.member.user.id, username: interaction.member.user.username, bot: interaction.member.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID?interaction.guildID:undefined, attachments: attach})
        } else if (interaction.user){
          request({cmd: getCmd(newJob), userid: interaction.user.id, username: interaction.user.username, bot: interaction.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID?interaction.guildID:undefined, attachments: attach})
        }
        return interaction.editParent({content:':floppy_disk: ** Model '+interaction.data.values[0]+'** selected',components:[]}).catch((e) => {console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('chooseSampler')) {
      if(newJob&&models){
        var changeSamplerResponse={content:':eye: **Sampler Menu**\nUse this menu to change the sampler being used',flags:64,components:[{type:1,components:[{type: 3,custom_id:'changeSampler-'+id+'-'+rn,placeholder:'Choose a sampler',min_values:1,max_values:1,options:[]}]}]}
        samplers.forEach((s)=>{changeSamplerResponse.components[0].components[0].options.push({label: s,value: s})})
        return interaction.editParent(changeSamplerResponse).then((r)=>{}).catch((e)=>{console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('changeSampler')) {
      var newSampler=interaction.data.values[0]
      if(newJob&&newSampler){
        newJob.sampler=newSampler // set the new model
        if(interaction.member){
          request({cmd: getCmd(newJob), userid: interaction.member.user.id, username: interaction.member.user.username, bot: interaction.member.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID?interaction.guildID:undefined, attachments: newJob.attachments})
        } else if (interaction.user){
          request({cmd: getCmd(newJob), userid: interaction.user.id, username: interaction.user.username, bot: interaction.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID?interaction.guildID:undefined, attachments: newJob.attachments})
        }
        return interaction.editParent({content:':eye: ** Sampler '+interaction.data.values[0]+'** selected',components:[]}).catch((e) => {console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('chooseEmbeds')) { // Not currently used, combines TI's and LORA's in one menu // todo use this if ti+lora count is below 100
      if(newJob&&lora&&ti){
        var changeEmbedResponse={content:':eye: **Embeds Menu**\n:pill: Embeddings are a way to supplement the current model with extra styles, characters or abilities.',flags:64,components:[]}
        debugLog('Loras: '+lora.length+'\nTextual Inversions: '+ti.length)
        for(let i=0;i<lora.length;i+=25){
          changeEmbedResponse.components.push({type:1,components:[{type: 3,custom_id:'addLora'+i+'-'+id+'-'+rn,placeholder:'Add a LORA',min_values:1,max_values:1,options:[]}]})
          lora.slice(i,i+25).forEach((l)=>{changeEmbedResponse.components[changeEmbedResponse.components.length-1].components[0].options.push({label: l,value: l,description: l})})
        }
        for(let i=0;i<ti.length;i+=25){
          changeEmbedResponse.components.push({type:1,components:[{type: 3,custom_id:'addTi'+i+'-'+id+'-'+rn,placeholder:'Add a Textual Inversion',min_values:1,max_values:1,options:[]}]})
          ti.slice(i,i+25).forEach((i)=>{changeEmbedResponse.components[changeEmbedResponse.components.length-1].components[0].options.push({label: i,value: i,description: i})})
        }
        return interaction.editParent(changeEmbedResponse).then((r)=>{}).catch((e)=>{console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('chooseTi')) {
      if(newJob&&ti){
        var changeEmbedResponse={content:':eye: **Textual Inversions Menu**\n:pill: Textual Inversions are a way to supplement the current model with extra styles, characters or abilities.',flags:64,components:[]}
        var page = interaction.data.custom_id.split('-').length===4 ? parseInt(interaction.data.custom_id.split('-')[3]) : 0 // get page number from id
        var batch = page===0 ? ti.slice(0,99) : ti.slice(page+99,page+199) // split tis into batches of 100 and pick our page of data
        for(let i=0;i<batch.length;i+=25){
          var batchSlice=batch.slice(i,i+25);var batchLabel=batchSlice[0][0]+' to '+batchSlice[batchSlice.length-1][0]
          changeEmbedResponse.components.push({type:1,components:[{type: 3,custom_id:'addTi'+i+'-'+id+'-'+rn+'-row'+i,placeholder:'Add a Textual Inversion - '+batchLabel,min_values:1,max_values:1,options:[]}]})
          batch.slice(i,i+25).forEach((i)=>{changeEmbedResponse.components[changeEmbedResponse.components.length-1].components[0].options.push({label: i,value: i,description: i})})
        }
        if(ti.length>100){ // only show pages if needed
          changeEmbedResponse.components.push({type:1,components:[
            {type: 2, style: 1, label: 'Back', custom_id: 'chooseTi-'+id+'-'+rn+'-'+(page-1),value:page-1,emoji:{name:'⬅️',id:null},disabled:page===0},
            {type: 2, style: 2, label: 'Page: '+(page+1), custom_id: 'chooseTi-'+id+'-'+rn+'-'+(page),value:page,emoji:{ name:'📃',id:null},disabled:true},
            {type: 2, style: 1, label: 'More', custom_id: 'chooseTi-'+id+'-'+rn+'-'+(page+1),value:page+1,emoji:{name:'➡️',id:null},disabled:(page*200)>(ti.length)}
          ]})
        }
        return interaction.editParent(changeEmbedResponse).then((r)=>{}).catch((e)=>{console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('chooseLora')) {
      if(newJob&&lora){
        var changeEmbedResponse={content:':eye: **Lora Menu**\n:pill: Loras are a way to supplement the current model with extra styles, characters or abilities.',flags:64,components:[]}
        var page = interaction.data.custom_id.split('-').length===4 ? parseInt(interaction.data.custom_id.split('-')[3]) : 0 // get page number from id
        var batch = page===0 ? lora.slice(0,99) : lora.slice(page+99,page+199) // split loras into batches of 100 and pick our page of data
        for(let i=0;i<batch.length;i+=25){
          var batchSlice=batch.slice(i,i+25);var batchLabel=batchSlice[0][0]+' to '+batchSlice[batchSlice.length-1][0]
          changeEmbedResponse.components.push({type:1,components:[{type: 3,custom_id:'addLora-'+id+'-'+rn+'-row'+i,placeholder:'Add a LORA - '+batchLabel,min_values:1,max_values:1,options:[]}]}) // Push a new row
          batchSlice.forEach((l)=>{changeEmbedResponse.components[changeEmbedResponse.components.length-1].components[0].options.push({label: l,value: l,description: l})}) // push items to row
        }
        if(lora.length>100){ // only show pages if needed
          changeEmbedResponse.components.push({type:1,components:[
            {type: 2, style: 1, label: 'Back', custom_id: 'chooseLora-'+id+'-'+rn+'-'+(page-1),value:page-1,emoji:{name:'⬅️',id:null},disabled:page===0},
            {type: 2, style: 2, label: 'Page: '+(page+1), custom_id: 'chooseLora-'+id+'-'+rn+'-'+(page),value:page,emoji:{ name:'📃',id:null},disabled:true},
            {type: 2, style: 1, label: 'More', custom_id: 'chooseLora-'+id+'-'+rn+'-'+(page+1),value:page+1,emoji:{name:'➡️',id:null},disabled:(page*200)>(lora.length)}
          ]})
        }
        return interaction.editParent(changeEmbedResponse).then((r)=>{}).catch((e)=>{console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('addLora')) {
      var newLora=interaction.data.values[0]
      if(newJob&&newLora){
        newJob.prompt+=' withLora('+newLora+',0.8)' // add lora to prompt
        if(interaction.member){
          request({cmd: getCmd(newJob), userid: interaction.member.user.id, username: interaction.member.user.username, bot: interaction.member.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID?interaction.guildID:undefined, attachments: newJob.attachments})
        } else if (interaction.user){
          request({cmd: getCmd(newJob), userid: interaction.user.id, username: interaction.user.username, bot: interaction.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID?interaction.guildID:undefined, attachments: newJob.attachments})
        }
        return interaction.editParent({content:':eye: ** LORA embed '+interaction.data.values[0]+'** selected',components:[]}).catch((e) => {console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('addTi')) {
      var newTi=interaction.data.values[0]
      if(newJob&&newTi){
        newJob.prompt+=' \<'+newTi+'\>' // add ti to prompt
        newJob.number=1
        if(interaction.member){
          request({cmd: getCmd(newJob), userid: interaction.member.user.id, username: interaction.member.user.username, bot: interaction.member.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID?interaction.guildID:undefined, attachments: newJob.attachments})
        } else if (interaction.user){
          request({cmd: getCmd(newJob), userid: interaction.user.id, username: interaction.user.username, bot: interaction.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID?interaction.guildID:undefined, attachments: newJob.attachments})
        }
        return interaction.editParent({content:':eye: ** Textual inversion '+interaction.data.values[0]+'** selected',components:[]}).catch((e) => {console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('chooseAspect')) {
      var aspectRatios = ['1:1','2:3','3:2','3:4','4:3','5:4','4:5','7:4','4:7','9:5','5:9','6:13','13:6','9:16','16:9','9:32','32:9']
      if(newJob){
        var changeAspectResponse={content:':eye: **Aspect Ratios**\n Different aspect ratios will give different compositions.',flags:64,components:[]}
        var oldPixelCount=newJob.width*newJob.height
        for(let i=0;i<aspectRatios.length;i+=25){
          changeAspectResponse.components.push({type:1,components:[{type: 3,custom_id:'addAspect'+i+'-'+id+'-'+rn,placeholder:'Change aspect ratio, keep pixel count',min_values:1,max_values:1,options:[]}]})
          aspectRatios.forEach((a)=>{
            var w=parseInt(a.split(':')[0]);var h=parseInt(a.split(':')[1]);var d;
            var newWidth=Math.round(Math.sqrt(oldPixelCount * w / h))
            var newHeight=Math.round(newWidth * h / w)
            if (a==='1:1'){d='square'}else if(w>h){d='landscape'}else{d='portrait'}
            changeAspectResponse.components[changeAspectResponse.components.length-1].components[0].options.push({label: a,value: a,description: d+' '+newWidth+'x'+newHeight})
          })
        }
        changeAspectResponse.components.push({type:1,components:[
          {type: 2, style: 2, label: "Resolution", custom_id: "editResolution-"+id+'-'+rn, emoji: { name: '📏', id: null}, disabled: false },
          {type: 2, style: 1, label: "Portrait", custom_id: "twkaspectPortrait-"+id+'-'+rn, emoji: { name: '↕️', id: null}, disabled: newJob.height===(defaultSize+192)&&newJob.width===defaultSize||false },
          {type: 2, style: 1, label: "Square", custom_id: "twkaspectSquare-"+id+'-'+rn, emoji: { name: '🔳', id: null}, disabled: newJob.height===defaultSize&&newJob.width===defaultSize||false },
          {type: 2, style: 1, label: "Landscape", custom_id: "twkaspectLandscape-"+id+'-'+rn, emoji: { name: '↔️', id: null}, disabled: newJob.height===defaultSize&&newJob.width===(defaultSize+192)||false }
        ]})
        return interaction.editParent(changeAspectResponse).then(()=>{}).catch((e)=>{debugLog(e)})
      }
    } else if (interaction.data.custom_id.startsWith('addAspect')) {
      var newAspect=interaction.data.values[0]
      if(newJob){
        var oldPixelCount=newJob.width*newJob.height
        var newAspectWidth=newAspect.split(':')[0]
        var newAspectHeight=newAspect.split(':')[1]
        newJob.width=Math.round(Math.sqrt(oldPixelCount * newAspectWidth / newAspectHeight))
        newJob.height=Math.round(newJob.width * newAspectHeight / newAspectWidth)
        if(interaction.member){
          request({cmd: getCmd(newJob), userid: interaction.member.user.id, username: interaction.member.user.username, bot: interaction.member.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID?interaction.guildID:undefined, attachments: newJob.attachments})
        } else if (interaction.user){
          request({cmd: getCmd(newJob), userid: interaction.user.id, username: interaction.user.username, bot: interaction.user.bot, channelid: interaction.channel.id, guildid:interaction.guildID?interaction.guildID:undefined, attachments: newJob.attachments})
        }
        return interaction.editParent({content:':eye: ** Aspect '+interaction.data.values[0]+'** selected',components:[]}).catch((e) => {console.error(e)})
      }
    }
  }
  if (!authorised(interaction,interaction.channel.id,interaction.guildID)) {
    log('unauthorised usage attempt from'.bgRed)
    log(interaction.member)
    return interaction.createMessage({content:':warning: You dont currently have permission to use this feature', flags:64}).catch((e) => {console.error(e)})
  }
})
async function directMessageUser(id,msg,channel){ // try, fallback to channel
  d = await bot.getDMChannel(id).catch(() => {
    log('failed to get dm channel, sending public message instead')
    if (channel&&channel.length>0){bot.createMessage(channel,msg).then(()=>{log('DM sent to '.dim+id)}).catch((err) => {log(err);log('failed to both dm a user or message in channel'.bgRed.white)})}
  })
  d.createMessage(msg).catch(() => {
    if (channel&&channel.length>0){bot.createMessage(channel,msg).then(()=>{log('DM sent to '.dim+id)}).catch((err) => {log(err);log('failed to both dm a user or message in channel'.bgRed.white)})}
  })
}

async function sendToGalleryChannel(serverId, originalChannelId, messageId, msg) { // Make a copy without buttons for the gallery
  time('sendToGalleryChannel')
  const galleryChannel = allGalleryChannels[serverId]
  if (!galleryChannel) {log(`No gallery channel found for server ID: ${serverId}`);return}
  if (originalChannelId===galleryChannel) return
  time('getChannel')
  const channel = await bot.getChannel(galleryChannel)
  timeEnd('getChannel')
  var alreadyInGallery=false
  //if(channel.messages.length<50){debugLog('fetching gallery message history');await channel.getMessages({limit: 100})} // if theres less then 50 in the channel message cache, fetch 100
  // await channel.getMessages({limit: 100})
  const messageLink = `https://discord.com/channels/${serverId}/${originalChannelId}/${messageId}`
  const components = [{ type: 1, components: [{ type: 2, style: 5, label: "Original message", url: messageLink, disabled: false }]}]
  channel.messages.forEach(message=>{if(message.content===msg.content){alreadyInGallery=true;debugLog('found in gallery')}}) // look through eris message cache for channel for matching msg
  if (!alreadyInGallery){
    if (msg && msg.embeds && msg.embeds.length > 0) {
      msg.embeds[0].description = ``
      await channel.createMessage({ content: msg.content, embeds: msg.embeds, components: components }).catch(() => {log(`Failed to send message to the specified channel for server ID: ${serverId}`)})
    } else {await channel.createMessage({ content: msg.content, components: components }).catch(() => {log(`Failed to send message to the specified channel for server ID: ${serverId}`)})}
  } else {debugLog('Found identical existing star gallery message')}
  timeEnd('sendToGalleryChannel')
}

async function moveToNSFWChannel(serverId, originalChannelId, messageId, msg) {
  time('sendToNSFWChannel')
  // similar to above, but transplant as-is with buttons and remove original
  const nsfwChannel = allNSFWChannels[serverId]
  if(originalChannelId===nsfwChannel) return
  if (!nsfwChannel) {log(`No nsfw channel found for server ID: ${serverId}`);return}
  const channel = await bot.getChannel(nsfwChannel)
  embeds = msg.embeds
  content = msg.content
  components = msg.components
  try{await channel.createMessage({ content: msg.content, components: components, embeds: embeds }).catch((err) => {debugLog(err);log(`Failed to move message to the NSFW channel for server ID: ${serverId}`)})}catch(err){log(err)}
  timeEnd('sendToNSFWChannel')
}

function progressBar(total,current,size=20,line = '🟥', slider = '🟦'){ // line = '▬', slider = '🔘' // size=40, line='□',slider='■'
	if (current>total) {
		var bar=slider.repeat(size+2) // line.repeat(size+2) 🟦🟦🟦🟦🌊🔥🟥🟥🟥🟥
		return [bar]
	}else{
		var percentage=current/total
		var progress=Math.round((size*percentage))
		var emptyProgress=size-progress
		var progressText=slider.repeat(progress-1)+'🌊' // line.repeat(progress).replace(/.$/, slider)
		var emptyProgressText='🔥'+line.repeat(emptyProgress)
		var bar=progressText+emptyProgressText
		return [bar]
	}
}

function emojiProgressBar(percent,emojis){
  if(percent===undefined||percent>100||percent===NaN) return ''
  emojiLibrary=[
    [':hourglass_flowing_sand:',':hourglass:'],
    ['🥚','🐣','🐤','🐔','🔥','🍗',':yum:'],
    [':clock12:',':clock1:',':clock2:',':clock3:',':clock4:',':clock5:',':clock6:',':clock7:',':clock8:',':clock9:',':clock10:',':clock11:'],
    [':baby:',':girl:',':woman:',':mirror_ball:',':heart_eyes:',':man_beard:',':kiss_woman_man:',':couple:',':ring:',':wedding:',':kiss_woman_man:',':bouquet:',':dove:',':red_car:',':airplane_departure:',':airplane:',':airplane_arriving:',':hotel:',':bed:',':smirk:',':eggplant:',':astonished:',':cherry_blossom:',':heart_on_fire:',':hushed:',':stuck_out_tongue:',':sweat_drops:',':sweat_smile:',':stuck_out_tongue_closed_eyes:',':stuck_out_tongue_winking_eye:',':sleeping:',':sleeping_accommodation:',':thermometer_face:',':nauseated_face:',':face_vomiting:',':pregnant_woman:',':pregnant_person:',':pregnant_man:',':ambulance:',':hospital:',':cold_sweat:',':face_exhaling:',':face_with_symbols_over_mouth:',':relieved:',':family_mwg:']
  ]
  if (emojis===undefined){
    emojis=config.emojiProgress ? config.emojiProgress.split(',') : emojiLibrary[1]
  }
  const numEmojis = emojis.length
  const emojiIndex = Math.floor(percent / 100 * numEmojis)
  var emoji = emojis[emojiIndex]
  if(emoji===undefined){emoji=emojis[emojis.length-1]}
  return emoji
}

bot.on("messageReactionAdd", async (msg,emoji,reactor) => {
  if (msg.author){targetUserId=reactor.user.id}else{
    try{msg=await bot.getMessage(msg.channel.id,msg.id);targetUserId=reactor.id}catch(err){log(err)}
  }
  var embeds=false
  if (msg.embeds){embeds=dJSON.parse(JSON.stringify(msg.embeds))}
  if (embeds&&msg.attachments&&msg.attachments.length>0) {embeds.unshift({image:{url:msg.attachments[0].url}})}
  if (msg.author&&msg.author.id===bot.application.id){
  var reactorid = reactor.id ? reactor.id : reactor.user.id
    switch(emoji.name){ // to use alongside starboard paste the following into starboard setup: star filters add content notmatch /^(?=.?:brain:.+?:straight_ruler:.+?:seedling:).$/
      case '😂':
      case '👍':
      case '⭐':
      case '❤️': try{sendToGalleryChannel(msg.channel.guild.id, msg.channel.id, msg.id, { content: msg.content, embeds: embeds })}catch(err){};break
      case '✉️': directMessageUser(targetUserId,{content: msg.content, embeds: embeds});break
      case '🙈': if(msg.content.includes(reactorid)||reactorid===config.adminID){try{moveToNSFWChannel(msg.channel.guild.id, msg.channel.id, msg.id, { content: msg.content, embeds: embeds, attachments: msg.attachments, components: msg.components });msg.delete().catch(() => {})}catch(err){log(err)}};break
      case '👎':
      case '⚠️':
      case '❌':
      case '💩': {
        log('Negative emojis'.red+emoji.name.red)
        try{if(msg.content.includes(reactorid)||reactorid===config.adminID){msg.delete().catch(() => {})}}catch(err){log(err)}
        break
      }
    }
  }
})

//bot.on("messageReactionRemoved", (msg,emoji,userid) => {log('message reaction removed');log(msg,emoji,userid)})
//bot.on("warn", (msg,id) => {if (msg!=={Error: 'Unknown guild text channel type: 15'}){log('warn'.bgRed);log(msg,id)}})
//bot.on("debug", (msg,id) => {log(msg,id)})
bot.on("disconnect", () => {log('disconnected'.bgRed)})
bot.on("error", async (err) => {
 if(err.code===1006) return // ignore discord websocket disconnects
 console.log(moment().format(), "--- BEGIN: ERROR ---")
 console.error(err)
 console.log(moment().format(), "--- END: ERROR ---")
})
bot.on("guildCreate", (guild) => {var m='joined new guild: '+guild.name;log(m.bgRed);directMessageUser(config.adminID,m)}) // todo send invite to admin
bot.on("guildDelete", (guild) => {var m='left guild: '+guild.name;log(m.bgRed);directMessageUser(config.adminID,m)})
//bot.on("guildAvailable", (guild) => {var m='guild available: '+guild.name;log(m.bgRed)})
//bot.on("channelCreate", (channel) => {var m='channel created: '+channel.name+' in '+channel.guild.name;log(m.bgRed)})
//bot.on("channelDelete", (channel) => {var m='channel deleted: '+channel.name+' in '+channel.guild.name;log(m.bgRed)})
//bot.on("channelUpdate", (channel,oldChannel) => {var m='channel updated: '+channel.name+' in '+channel.guild.name;log(m.bgRed);if(channel.topic!==oldChannel.topic){log('new topic:'+channel.topic)}})
var lastMsgChan=null
bot.on("messageCreate", (msg) => {
  if(msg.author.bot) return // ignore all bot messages
  // an irc like view of non bot messages in allowed channels. Creepy but convenient
  if (config.showChat&&!msg.author.bot){
    if(lastMsgChan!==msg.channel.id&&msg.channel.name&&msg.channel.guild){
      log('#'.bgBlue+msg.channel.name.bgBlue+'-'+msg.channel.id.bgWhite.black+'-'+msg.channel.guild.name.bgBlue+'')
      lastMsgChan=msg.channel.id // Track last channel so messages can be grouped with channel headers
    }
    log(msg.author.username.bgBlue.red.bold+':'+msg.content.bgBlack)
    msg.attachments.map((u)=>{return u.proxy_url}).forEach((a)=>{log(a)})
    msg.embeds.map((e)=>{return e}).forEach((e)=>{log(e)})
    msg.components.map((c)=>{return c}).forEach((c)=>{log(c)})
  }
  // end irc view
  if(msg.mentions.length>0){
    msg.mentions.forEach((m)=>{
      if (m.id===bot.application.id){
        if (msg.referencedMessage===null){ // not a reply
          msg.content = msg.content.replace('<@'+m.id+'>','').replace('!dream','')
          msg.content='!dream '+msg.content
        } else if (msg.referencedMessage.author.id===bot.application.id) { // a reply to a message from arty
          if (msg.referencedMessage.components && msg.referencedMessage.components[0] && msg.referencedMessage.components[0].components[0] && msg.referencedMessage.components[0].components[0].custom_id.startsWith('refresh-')) {
            var jobid = msg.referencedMessage.components[0].components[0].custom_id.split('-')[1]
            var newJob = JSON.parse(JSON.stringify(queue[jobid - 1]))
            var newSeed = msg.content.includes('--seed') ? '' : ' --seed ' + newJob.seed
            var newModel = msg.content.includes('--model') ? '' : ' --model ' + newJob.model
            var newSampler = msg.content.includes('--sampler') ? '' : ' --sampler ' + newJob.sampler
            var initSampler = msg.content.includes('--sampler') ? '' : ' --sampler ddim '
            var newSteps = msg.content.includes('--steps') ? '' : ' --steps ' + newJob.steps
            var newScale = msg.content.includes('--scale') ? '' : ' --scale ' + newJob.scale
            var newHeight = msg.content.includes('--height') ? '' : ' --height ' +newJob.height
            var newWidth = msg.content.includes('--width') ? '' :  ' --width ' + newJob.width
            var newStrength = msg.content.includes('--strength') ? '' : ' --strength ' + newJob.strength
            var newPerlin = msg.content.includes('--perlin') ? '' : ' --perlin ' + newJob.perlin
            var newSeamless = msg.content.includes('--seamless') && !msg.content.includes('--seamless false') ? ' --seamless ' : ''
            var newThreshold = msg.content.includes('--threshold') ? '' : ' --threshold ' + newJob.threshold
            var newGfpgan_strength = msg.content.includes('--gfpgan_strength') ? '' : ' --gfpgan_strength ' + newJob.gfpgan_strength
            var newCodeformer_strength = msg.content.includes('--codeformer_strength') ? '' : ' --codeformer_strength ' + newJob.codeformer_strength
            var newUpscale_level = msg.content.includes('--upscale_level') ? '' : ' --upscale_level ' + newJob.upscale_level
            var newUpscale_strength = msg.content.includes('--upscale_strength') ? '' : ' --upscale_strength ' + newJob.strength
            var jobstring = newWidth + newHeight + newSteps + newSeed + newStrength + newScale + newSampler + newModel + newPerlin + newSeamless + newThreshold + newGfpgan_strength + newCodeformer_strength + newUpscale_level + newUpscale_strength
            // only works with normal renders - modified to change only mentioned parameters, otherwise use the same from referenced job
            msg.content = msg.content.replace('<@' + m.id + '>', '').replace('!dream', '')
            if (msg.content.startsWith('..')) {
              msg.content = '!dream ' + newJob.prompt + jobstring + msg.content.substring(2, msg.content.length)
            } else if (msg.content.startsWith('info')) {
              var infostring = `!dream ` + newJob.prompt + newWidth + newHeight + newSteps + newSeed + newScale + newSampler + newModel
              infostring += newJob.strength !== 0.7 ? newStrength : ''
              infostring += newJob.perlin !== 0 ? newPerlin : ''
              infostring += newJob.seamless !== false ? ' --seamless' : ''
              infostring += newJob.hires_fix !== false ? ' --hires_fix' : ''
              infostring += newJob.variation_amount !== 0 ? ` --variation_amount ` + newJob.variation_amount : ''
              infostring += newJob.upscale_level !== '' ? newUpscale_level + newUpscale_strength : ''
              infostring += newJob.threshold !== 0 ? newThreshold : ''
              infostring += newJob.gfpgan_strength !== 0 ? newGfpgan_strength : ''
              infostring += newJob.codeformer_strength !== 0 ? newCodeformer_strength : ''
              var embed = { title: '*Long press to copy the command*', description: infostring, color: getRandomColorDec() }
              bot.createMessage(msg.channel.id, { embed })
            } else if (msg.content.startsWith('seed')) {
              var embed = { title: '*Long press to copy the seed*', description: newSeed, color: getRandomColorDec() }
              try{bot.createMessage(msg.channel.id, { embed })}catch(err){log(err)}
            } else if (msg.content.startsWith('models')){
                var modelsToTest=[]
                var modelsToTestString=msg.content.substring(7)
                var modelKeys=Object.keys(models)
                if(modelsToTestString==='all'){modelsToTest=modelKeys}else{modelsToTestString.split(' ').forEach(m=>{if(modelKeys.includes(m)){modelsToTest.push(m)}})}
                modelsToTest.forEach(m=>{
                  newJob.model=m
                  request({cmd: getCmd(newJob), userid: msg.author.id, username: msg.author.username, bot: msg.author.bot, channelid: msg.channel.id, guildid: msg.channel.guild.id, attachments: msg.attachments})
                })
            } else if (msg.content.startsWith('samplers')){
                var samplersToTest=[]
                var samplersToTestString=msg.content.split(' ')
                debugLog(samplersToTestString)
                if(samplersToTestString.length>0&&samplersToTestString.includes('all')){samplersToTest=samplers;debugLog(samplersToTest)}else if(samplersToTestString.length>0){samplersToTestString.forEach(s=>{if(samplers.includes(s)){samplersToTest.push(s)}})}
                samplersToTest.forEach(s=>{
                  newJob.sampler=s
                  request({cmd: getCmd(newJob), userid: msg.author.id, username: msg.author.username, bot: msg.author.bot, channelid: msg.channel.id, guildid: msg.channel.guild.id, attachments: msg.attachments})
                })
            } else if (msg.content.startsWith('embeds')){
                var tisToTest=[];var lorasToTest=[];var tisToTestString=msg.content.substring(7);var lorasToTestString=tisToTestString
                if(tisToTestString==='all'){tisToTest=ti;debugLog(tisToTest)}else{tisToTestString.split(' ').forEach(t=>{
                  partialMatches(ti,t).forEach((m)=>{tisToTest.push(m)})
                })}
                if(lorasToTestString==='all'){lorasToTest=lora}else{lorasToTestString.split(' ').forEach(l=>{partialMatches(lora,l).forEach((m)=>{lorasToTest.push(m)})})}
                var basePrompt=newJob.prompt
                var totalTests=tisToTest.length+lorasToTest.length
                var newMsg='Testing '+totalTests+' embeddings total at a cost of '+totalTests*newJob.cost+' :coin: '
                if (tisToTest.length>0){newMsg+='\nTextual inversions: '+tisToTest.join(' , ')}
                if (lorasToTest.length>0){newMsg+='\nLORAs: '+lorasToTest.join(' , ')}
                if (totalTests>0){
                  sliceMsg(newMsg).forEach((m)=>{try{bot.createMessage(msg.channel.id, m)}catch(err){debugLog(err)}})
                  var guild = msg.channel.guild ? msg.channel.guild.id : undefined
                  tisToTest.forEach(t=>{
                    newJob.prompt=basePrompt+' <'+t+'>'
                    request({cmd: getCmd(newJob), userid: msg.author.id, username: msg.author.username, bot: msg.author.bot, channelid: msg.channel.id, guildid: guild, attachments: msg.attachments})
                  })
                  lorasToTest.forEach(l=>{
                    newJob.prompt=basePrompt+' withLora('+l+',0.8)'
                    request({cmd: getCmd(newJob), userid: msg.author.id, username: msg.author.username, bot: msg.author.bot, channelid: msg.channel.id, guildid: guild, attachments: msg.attachments})
                  })
                } else {try{bot.createMessage(msg.channel.id, 'No results found for your search , see `/embeds`')}catch(err){debugLog(err)}}
            }
          }
          if (msg.content.startsWith('template')&&msg.referencedMessage.attachments){
            msg.attachments=msg.referencedMessage.attachments
            var newDimensions=' --width '+msg.referencedMessage.attachments[0].width+' --height '+msg.referencedMessage.attachments[0].height
            msg.content='!dream '+msg.content.substring(9)
            if (!msg.content.includes('-- width')&&!msg.content.includes('--height')){msg.content+=newDimensions}
          } else if (msg.content.startsWith('inpaint')&&msg.referencedMessage.attachments&&msg.referencedMessage.attachments[0]['content_type'].startsWith('image')){
            msg.attachments=msg.referencedMessage.attachments
            var newDimensions=' --width '+msg.referencedMessage.attachments[0].width+' --height '+msg.referencedMessage.attachments[0].height
            msg.content='!dream '+msg.content.substring(7)
            if(!msg.content.includes('-- model')){msg.content+=' --model '+defaultModelInpaint}
            if(!msg.content.includes('--strength')){msg.content+=' --strength '+defaultInpaintStrength}
            if (!msg.content.includes('-- width')&&!msg.content.includes('--height')){msg.content+=newDimensions}
          } else if (msg.content.startsWith('background')||msg.content.startsWith('!background')){
            msg.content='!background'
            msg.attachments=msg.referencedMessage.attachments
          } else if (msg.content.startsWith('crop')||msg.content.startsWith('!crop')){
            msg.content='!crop'
            msg.attachments=msg.referencedMessage.attachments
          } else if (msg.content.startsWith('split')||msg.content.startsWith('!split')){
            msg.content='!'+msg.content
            msg.attachments=msg.referencedMessage.attachments
          } else if (msg.content.startsWith('expand')||msg.content.startsWith('!expand')){
            msg.content=msg.content.split(' ')[0]
            if (msg.content[0]!=='!'){msg.content='!'+msg.content}
            msg.attachments=msg.referencedMessage.attachments
          } else if (msg.content.startsWith('fade')||msg.content.startsWith('!fade')){
            msg.content=msg.content.split(' ')[0]
            if (msg.content[0]!=='!'){msg.content='!'+msg.content}
            msg.attachments=msg.referencedMessage.attachments
          } else if (msg.content.startsWith('text')||msg.content.startsWith('!text')){
            msg.attachments=msg.referencedMessage.attachments
          } else if (msg.content.startsWith('metadata')){
            msg.content='!metadata'
            msg.attachments=msg.referencedMessage.attachments
          }
        }
      }
    })
  }
  if (msg.author.id !== bot.id && authorised(msg, msg.channel.id, msg.guildID)) {
    var lines = msg.content.split('\n')
    //debugLog('msg.channel.id:'+msg.channel.id+',msg.author.id:'+msg.author.id+',msg.channel.id:'+msg.channel.id+',msg.channel.guild.id:'+msg.channel.guild.id+',msg.guildID:'+msg.guildID)
    var re = /^(\d+\.\s*)?(!dream.*)$/
    lines.forEach(line => {
      var match = line.match(re)
      if (match !== null) {
        var c = match[2].split(' ')[0]
        switch (c) {
          case '!dream':request({cmd: match[2].substr(7), userid: msg.author.id, username: msg.author.username, bot: msg.author.bot, channelid: msg.channel.id, guildid: msg.guildID, attachments: msg.attachments})
            break
        }
      }
    })
  }
  var c=msg.content.split(' ')[0]
  if (msg.author.id!==bot.id&&authorised(msg,msg.channel.id,msg.guildID,)){ // Work anywhere its authorized
    switch(c){
      case '!help':{help(msg.channel.id);break}
      case '!recharge':rechargePrompt(msg.author.id,msg.channel.id);break
      case '!lexica':lexicaSearch(msg.content.substr(8, msg.content.length),msg.channel.id);break
      case '!meme':{
        if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){
          meme(msg.content.substr(6, msg.content.length),msg.attachments.map((u)=>{return u.proxy_url}),msg.author.id,msg.channel.id)
        }else if (msg.referencedMessage){
          meme(msg.content.substr(6, msg.content.length),msg.referencedMessage.attachments.map((u)=>{return u.proxy_url}),msg.author.id,msg.channel.id)
        }else if (msg.content.startsWith('!meme animateseed')){
          {meme(msg.content.substr(6, msg.content.length),null,msg.author.id,msg.channel.id)}
        }else{debugLog("Nothing to work with for meme")}
        break
      }
      case '!avatar':{var avatars='';msg.mentions.forEach((m)=>{avatars+=m.avatarURL.replace('size=128','size=512')+'\n'});bot.createMessage(msg.channel.id,avatars);break}
      case '!background':{
        if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          attachmentsUrls.forEach((url)=>{removeBackground(url,msg.channel.id,msg.author.id)})
        }
        break
      }
      case '!gift':{
        if (msg.mentions.length>0){
          var creditsToGift=parseFloat(msg.content.split(' ')[1])
          if (Number.isInteger(creditsToGift)){
            msg.mentions.forEach((m)=>{
              if(msg.author.id!==m.id) creditTransfer(creditsToGift,msg.author.id,m.id,msg.channel.id) // no self transfers
            })
          }
        }
        break
      }
      case '!crop':{
        if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          attachmentsUrls.forEach((url)=>{
            log('cropping '+url)
            jimp.read(url,(err,img)=>{
              if(err){log('Error during cropping'.bgRed);log(err)}
              try{img.autocrop()}catch(err){debugLog(err)}
              var newMsg='<@'+msg.author.id+'> used `!crop`'
              //if(!creditsDisabled){chargeCredits(msg.author.id,0.05);newMsg+=', it cost :coin:`0.05`/`'+creditsRemaining(msg.author.id)+'`'}
              img.getBuffer(jimp.MIME_PNG, (err,buffer)=>{
                if(err){log(err)}
                bot.createMessage(msg.channel.id, newMsg, {file: buffer, name: 'cropped.png'})
              })
            })
          })
        }
        break
      }
      case '!expandup':
      case '!expanddown':
      case '!expandleft':
      case '!expandright':
      case '!expandsides':
      case '!expand':{
        if(msg.attachments.length>0){
          var mimetype=msg.attachments[0].content_type
          var validMimetypes=['image/png','image/jpeg']
          log(mimetype)
        }
        if (msg.attachments.length>0&&validMimetypes.includes(mimetype)){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          attachmentsUrls.forEach((url)=>{
            log('expanding '+url)
            jimp.read(url,(err,img)=>{
              if(err){log('Error during expansion'.bgRed);log(err)}
              img.background(0x0)
              var expandHeight=256;var expandWidth=256;var x=0;var y=0
              switch(c){
                case '!expand':{expandHeight=256;expandWidth=256;x=128;y=128;break}
                case '!expandup':{expandHeight=256;expandWidth=0;x=0;y=256;break}
                case '!expanddown':{expandHeight=256;expandWidth=0;x=0;y=0;break}
                case '!expandleft':{expandHeight=0;expandWidth=256;x=256;y=0;break}
                case '!expandright':{expandHeight=0;expandWidth=256;x=0;y=0;break}
                case '!expandsides':{expandHeight=0;expandWidth=256;x=128;y=0;break}
              }
              var newImg=new jimp(img.bitmap.width+expandWidth,img.bitmap.height+expandHeight,0x0, function (err,image) {
                newImg.background(0x0).blit(img,x,y).getBuffer(jimp.MIME_PNG, (err,buffer)=>{
                  if(err){log(err)}
                  var newMsg = '<@'+msg.author.id+'> used `'+c+'`\nNew image size: '+newImg.bitmap.width+' x '+newImg.bitmap.height
                  //if (!creditsDisabled){chargeCredits(msg.author.id,0.05);newMsg+='\nIt cost :coin:`0.05`/`'+creditsRemaining(msg.author.id)+'`'}
                  bot.createMessage(msg.channel.id, newMsg, {file: buffer, name: 'expand.png'})
                })
              })
            })
          })
        }
        break
      }
      case '!fadeup':
      case '!fadedown':
      case '!fadeleft':
      case '!faderight':{
        if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          attachmentsUrls.forEach((url)=>{
            log('fading '+url)
            jimp.read(url,(err,img)=>{
              if(err){log('Error during fading'.bgRed);log(err)}
              var startx=0;var starty=0;var endx=0;var endy=0;var a=0;var newa=0;var fadeWidth=128
              switch(msg.content.split('fade')[1]){
                case('up'):{startx=0;starty=0;endx=img.bitmap.width;endy=fadeWidth;break}
                case('down'):{startx=0;starty=img.bitmap.height-fadeWidth;endx=img.bitmap.width;endy=fadeWidth;break}
                case('left'):{startx=0;starty=0;endx=fadeWidth;endy=img.bitmap.height;break}
                case('right'):{startx=img.bitmap.width-fadeWidth;starty=0;endx=fadeWidth;endy=img.bitmap.height;break}
              }
              img.scan(startx,starty,endx,endy, ((x,y,idx)=>{
                  //a=img.bitmap.data[idx+3]
                  switch(msg.content.split('fade')[1]){
                      case('up'):{newa=(y*4)+3;break}
                      case('down'):{newa=255-((y-starty)*2);break}
                      case('left'):{newa=(x*4);break}
                      case('right'):{newa=255-((x-startx)*2);break}
                  }
                  if(newa>255){newa=255};if(newa<0){newa=0}
                  img.bitmap.data[idx+3]=newa
              }))
              img.getBuffer(jimp.MIME_PNG, (err,buffer)=>{
                if(err){log(err)}
                  var newMsg='<@'+msg.author.id+'> used `'+c+'`'
                  if(!creditsDisabled){
                    chargeCredits(msg.author.id,0.05)
                    newMsg+=', it cost :coin:`0.05`/`'+creditsRemaining(msg.author.id)+'`'
                  }
                  bot.createMessage(msg.channel.id, newMsg, {file: buffer, name: 'faded.png'})
              })
            })
          })
        }
        break
      }
      case '!split':{
        if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          attachmentsUrls.forEach((url)=>{
            log('splitting '+url)
            var splitCmd=msg.content.split(' ')
            var splitColumns=Math.min(splitCmd[1] ? splitCmd[1]:4,20)
            var splitRows=Math.min(splitCmd[2] ? splitCmd[2]:1,20)
            var splitSegments=[]
            jimp.read(url,(err,img)=>{
              if(err){log('Error during splitting'.bgRed);log(err)}
              var width=img.getWidth()
              var height=img.getHeight()
              loop(splitColumns,c=>{
                c++
                debugLog(c)
                loop(splitRows,r=>{
                  r++
                  debugLog(r)
                  var cropWidth=width/splitColumns // crop is this wide
                  var cropHeight=height/splitRows // crop is this high
                  var cropX=Math.max(Math.min((cropWidth*c)-(cropWidth),width),0) // crop starts x pixels from left border
                  var cropY=Math.max(Math.min((cropHeight*r)-(cropHeight),height),0) // crop starts y pixels from top border
                  debugLog('Img width: '+width+'\nImg height: '+height)
                  debugLog('Cropping: x '+cropX+' y '+cropY+' width '+cropWidth+' height '+cropHeight)
                  var segment=null
                  try{segment=img.crop(cropX,cropY,cropWidth,cropHeight)}catch(err){debugLog(err)}
                  if(segment){splitSegments.push(segment)}
                })
              })
              splitSegments.forEach((s)=>{
                s.getBuffer(jimp.MIME_PNG, (err,buffer)=>{
                  if(err){log(err)}
                    var newMsg='<@'+msg.author.id+'> used `'+c+'`'
                    if(!creditsDisabled){
                      chargeCredits(msg.author.id,0.01)
                      newMsg+=', it cost :coin:`0.01`/`'+creditsRemaining(msg.author.id)+'`'
                    }
                    try{bot.createMessage(msg.channel.id, newMsg, {file: buffer, name: 'split.png'})}catch(err){debugLog(err)}
                })
              })
            }).catch(err=>{debugLog('Error reading image: ' + err)})
          })
        }
        break
      }
      case '!textTop':
      case '!textBottom':
      case '!textCentre':
      case '!textTopLeft':
      case '!textTopRight':
      case '!textBottomLeft':
      case '!textBottomRight':
      case '!textLeft':
      case '!textRight':
      case '!text':{
        if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          attachmentsUrls.forEach((url)=>{
            var newTxt=msg.content.substr(c.length+1); var gravity=''
            switch(c){
              case '!text':
              case '!textBottom':{gravity='south';break}
              case '!textBottomLeft':{gravity='southwest';break}
              case '!textBottomRight':{gravity='southeast';break}
              case '!textTop':{gravity='north';break}
              case '!textTopLeft':{gravity='northwest';break}
              case '!textTopRight':{gravity='northeast';break}
              case '!textCentre':{gravity='centre';break}
              case '!textLeft':{gravity='west';break}
              case '!textRight':{gravity='east';break}
            }
            textOverlay(url,newTxt,gravity,msg.channel.id,msg.author.id)
          })
        }
        break
      }
      case '!models':{listModels(msg.channel.id);break}
      case '!imgdiff':{
        if (msg.attachments.length===2&&msg.attachments[0].content_type.startsWith('image/')&&msg.attachments[1].content_type.startsWith('image/')){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          jimp.read(attachmentsUrls[0], (err,img1)=>{
            jimp.read(attachmentsUrls[1], (err,img2)=>{
              var distance = jimp.distance(img1,img2)
              var diff = jimp.diff(img1,img2)
              var newMsg = 'Image 1 hash: `'+img1.hash()+'`\nImage 2 hash: `'+img2.hash()+'`\nHash Distance: `'+distance+'`\nImage Difference: `'+diff.percent*100+' %`'
              diff.image.getBuffer(jimp.MIME_PNG, (err,buffer)=>{
                if(err){debugLog(err)}
                try{bot.createMessage(msg.channel.id, newMsg, {file: buffer, name: 'imgdiff.png'})}catch(err){debugLog(err)}
              })
            })
          })
        }
        break
      }
      case '!metadata':{
        if (msg.attachments.length===1&&msg.attachments[0].content_type.startsWith('image/')){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          metaDataMsg(attachmentsUrls[0],msg.channel.id)
        }
        break
      }
      case '!embeds':{listEmbeds(msg.channel.id);break}
      case '!stats':{
        if(msg.author.id!==config.adminID&&statsAdminOnly){ // not allowed if non-admin and admin only 
          log('rejected attempt to view stats by non-admin')
        } else {
          getStats(msg.channel.id,msg.content.split(' ')[1],msg.content.split(' ')[2],msg.content.split(' ')[3])
        }
        break
      }
    }
  if (msg.author.id===config.adminID) { // admins only
    if (c.startsWith('!')){log('admin command: '.bgRed+c)}
    switch(c){
      case '!wipequeue':{break} // disabled // rendering=false;queue=[];dbWrite();log('admin wiped queue')
      case '!queue':{viewQueue();break}
      case '!cancel':{cancelCurrentRender();try{bot.createMessage(msg.channel.id,':warning: Jobs cancelled')}catch(err){log(err)};break}
      case '!canceljob':{cancelJob(msg.content.split(' ')[1]);try{bot.createMessage(msg.channel.id,':warning: Job '+msg.content.split(' ')[1]+' cancelled')}catch(err){log(err)};break}
      case '!canceluser':{cancelUser(msg.content.split(' ')[1]);try{bot.createMessage(msg.channel.id,':warning: Jobs for user '+msg.content.split(' ')[1]+' cancelled')}catch(err){log(err)};break}
      case '!pause':{try{bot.editStatus('dnd')}catch(err){log(err)};paused=true;rendering=true;try{chat(':pause_button: Bot is paused, requests will still be accepted and queued for when I return')}catch(err){log(err)};break}
      case '!resume':{socket.emit('requestSystemConfig');paused=false;rendering=false;bot.editStatus('online');chat(':play_pause: Bot is back online');processQueue();break}
      case '!checkpayments':{checkNewPayments();break}
      case '!repostfails':{repostFails();break}
      case '!restart':{log('Admin triggered bot restart'.bgRed.white);exit(0);break}
      case '!creditdisabled':{log('Credits have been disabled'.bgRed.white);creditsDisabled=true;bot.createMessage(msg.channel.id,'Credits have been disabled');break}
      case '!creditenabled':{log('Credits have been enabled'.bgRed.white);creditsDisabled=false;bot.createMessage(msg.channel.id,'Credits have been enabled');break}
      case '!credit':{
        if (msg.mentions.length>0){
          var creditsToAdd=parseFloat(msg.content.split(' ')[1])
          if (Number.isInteger(creditsToAdd)){
            msg.mentions.forEach((m)=>{creditRecharge(creditsToAdd,'manual',m.id)})
            bot.createMessage(msg.channel.id,(msg.mentions.length)+' users received a manual `'+creditsToAdd+'` :coin: topup')
          } else {debugLog('creditsToAdd failed int test');debugLog(creditsToAdd)}
        }
        break
      }
      case '!say':{
        var sayChan=msg.content.split(' ')[1]
        var sayMsg=msg.content.substr((Math.ceil(Math.log10(sayChan+1)))+(msg.content.indexOf(msg.content.split(' ')[1])))
        if(Number.isInteger(parseInt(sayChan))&&sayMsg.length>0){
          log('sending message as arty to '+sayChan+':'+sayMsg)
          try{chatChan(sayChan,sayMsg)}
          catch(err){log('failed to !say with error:'.bgRed);log(err)}
        }
        break
      }
      case '!guilds':{
        debugLog('Guild count: '+bot.guilds.size)
        var guilds = bot.guilds//.sort((a, b) => a.memberCount - b.memberCount)
        guilds.forEach((g)=>{log({id: g.id, name: g.name, ownerID: g.ownerID, description: g.description, memberCount: g.memberCount})})
        break
      }
      case '!leaveguild':{bot.leaveGuild(msg.content.split(' ')[1]);break}
      case '!getmessages':{var cid=msg.content.split(' ')[1];if(cid){bot.getMessages(cid).then(x=>{x.reverse();x.forEach((y)=>{log(y.author.username.bgBlue+': '+y.content);y.attachments.map((u)=>{return u.proxy_url}).forEach((a)=>{log(a)})})})};break}
      case '!updateslashcommands':{bot.getCommands().then(cmds=>{bot.commands = new Collection();for (const c of slashCommands) {bot.commands.set(c.name, c);bot.createCommand({name: c.name,description: c.description,options: c.options ?? [],type: Constants.ApplicationCommandTypes.CHAT_INPUT})}});break}
      case '!deleteslashcommands':{bot.bulkEditCommands([]);break}
      case '!randomisers':{
        var newMsg='**Currently loaded randomisers**\n'
        for (r in randoms){newMsg+='`{'+randoms[r]+'}`='+getRandom(randoms[r])+'\n'}
        if(newMsg.length<=2000){newMsg.length=1999} //max discord msg length of 2k
        //try{chatChan(msg.channel.id,newMsg)}catch(err){log(err)}
        sliceMsg(newMsg).forEach((m)=>{try{bot.createMessage(msg.channel.id, m)}catch(err){debugLog(err)}})
        break
      }
      case '!reloadconfig':{reloadConfig();break}
    }
  }
}})

// Socket listeners for invokeai backend api
//socket.on("connect", (socket) => {log(socket)})
socket.on("generationResult", (data) => {generationResult(data)})
socket.on("postprocessingResult", (data) => {postprocessingResult(data)})
socket.on("systemConfig", (data) => {debugLog('systemConfig received');currentModel=data.model_weights;models=data.model_list})
socket.on("modelChanged", (data) => {currentModel=data.model_name;models=data.model_list;debugLog('modelChanged to '+currentModel)})
var progressUpdate = {currentStep: 0,totalSteps: 0,currentIteration: 0,totalIterations: 0,currentStatus: 'Initializing',isProcessing: false,currentStatusHasSteps: true,hasError: false}
socket.on("progressUpdate", (data) => {
  progressUpdate=data
  if(['common.statusProcessing Complete'].includes(data['currentStatus'])){//'common:statusGeneration Complete'
    intermediateImage=null
    if(dialogs.queue!==null){
      dialogs.queue.delete().catch((err)=>{debugLog(err)}).then(()=>{
        dialogs.queue=null;intermediateImage=null;queueStatusLock=false
      })
    }
  } else {
    queueStatus()
  }
})
var intermediateImage=null
var intermediateImagePrior=null
socket.on("intermediateResult", (data) => {
  if(!showPreviews)return
  buf=new Buffer.from(data.url.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  if(buf!==intermediateImagePrior){ // todo look at image difference % instead
    jimp.read(buf, (err,img)=>{
      if(err){log(err)}
      side=Math.max(img.bitmap.width,img.bitmap.height)
      scale=Math.round(448/side)
      img.scale(scale, jimp.RESIZE_NEAREST_NEIGHBOR) // RESIZE_NEAREST_NEIGHBOR fastest but bad quality // RESIZE_BILINEAR is better quality, slower
      img.getBuffer(img.getMIME(),(err,img2)=>{
        intermediateImage=img2
        intermediateImagePrior=buf
        if(!queueStatusLock){queueStatus()}
      })
    })
  }
})
socket.on("foundLoras", (answer) =>{lora=answer.map(item=>item.name).sort()})
socket.on("foundTextualInversionTriggers", (answer) =>{debugLog(answer);ti=answer.local_triggers.map(item=>item.name).map(str => str.replaceAll('<', '').replaceAll('>', '')).sort()})
socket.on('error', (error) => {
  log('Api socket error'.bgRed);log(error)
  var nowJob=queue[queue.findIndex((j)=>j.status==="rendering")]
  if(nowJob){
    log('Failing status for:');nowJob.status='failed';log(nowJob)
    chatChan(nowJob.channel,':warning: <@'+nowJob.userid+'>, there was an error in your request with prompt: `'+nowJob.prompt+'`\n**Error:** `'+error.message+'`\n')
  }
  rendering=false
})

function getObjKey(obj,value){return Object.keys(obj).find(key=>obj[key]===value)}
idToJob = (id)=>{return queue[queue.findIndex(x=>x.id===id)]}
urlToBuffer = async(url)=>{
    return new Promise((resolve,reject)=>{
    axios.get(url,{responseType:'arraybuffer'})
      .then(res=>{resolve(Buffer.from(res.data))})
      .catch(err=>{reject(err)})
    })
}
getHeaders=(form)=>{
  return new Promise((resolve, reject) => {
      form.getLength((err, length) => {
          if(err){reject(err)}
          let headers=Object.assign({'Content-Length': length}, form.getHeaders())
          resolve(headers)
      })
  })
}
uploadInitImage=async(buf,id)=>{
    return new Promise((resolve,reject)=>{
        let form = new FormData()
        form.append("data",JSON.stringify({kind:'init'}))
        form.append("file",buf,{contentType:'image/png',filename:id+'.png'})
        getHeaders(form).then(headers=>{
            return axios.post(config.apiUrl+'/upload',form, {headers:headers})
        }).then((response)=>{resolve(response.data)}).catch(err=>reject(err))// {url,width,height,mtime,thumbnail}
    })
}
addRenderApi = async(id,initimg=null)=>{
  var job=idToJob(id)
  job.status='rendering'
  if(job.attachments[0]?.content_type?.startsWith('image')) initimg = await urlToBuffer(job.attachments[0].proxy_url)
  if(initimg!==null){
    var uploadresponse=await uploadInitImage(initimg,id)
    job.init_img=invokePath+'/'+uploadresponse.url.replace('outputs/','')
    job.initimg=null
    emitRenderApi(job)
  }else{emitRenderApi(job)}
}

async function emitRenderApi(job){
  var prompt=job.prompt
  var postObject={
      "prompt": prompt,
      "iterations": job.number,
      "steps": job.steps,
      "cfg_scale": job.scale,
      "threshold": job.threshold,
      "perlin": job.perlin,
      "sampler_name": job.sampler,
      "width": job.width,
      "height": job.height,
      "seed": job.seed,
      "progress_images": false,
      "variation_amount": job.variation_amount,
      "strength": job.strength,
      "fit": true,
      "progress_latents": true,
      "generation_mode": 'txt2img',
      "infill_method": 'patchmatch'
  }
  if(job.text_mask){
    var mask_strength=0.5
    if(job.mask_strength){mask_strength=job.mask_strength}
    if(job.invert_mask&&job.invert_mask===true){postObject.invert_mask=true}
    log('adding text mask');postObject.text_mask=[job.text_mask,mask_strength]
  }
  if(job.with_variations.length>0){log('adding with variations');postObject.with_variations=job.with_variations}
  if(job.seamless&&job.seamless===true){postObject.seamless=true}
  if(job.hires_fix&&job.hires_fix===true){postObject.hires_fix=true}
  var upscale=false
  var facefix=false
  if(job.gfpgan_strength!==0){facefix={type:'gfpgan',strength:job.gfpgan_strength}}
  if (job.codeformer_strength===undefined){job.codeformer_strength=0}
  if(job.codeformer_strength!==0){facefix={type:'codeformer',strength:job.codeformer_strength,codeformer_fidelity:1}}
  if(job.upscale_level!==''){upscale={level:job.upscale_level,strength:job.upscale_strength,denoise_str: 0.75}}
  if(job.symh||job.symv){postObject.h_symmetry_time_pct=job.symh;postObject.v_symmetry_time_pct=job.symv}
  if(job.init_img){postObject.init_img=job.init_img}
  if(job&&job.model&&currentModel&&job.model!==currentModel){debugLog('job.model is different to currentModel, switching');requestModelChange(job.model)}
  [postObject,upscale,facefix,job].forEach((o)=>{
    var key=getObjKey(o,undefined)
    if(key!==undefined){if(key==='codeformer_strength'){upscale.strength=0}} // not undefined in this context means there is a key that IS undefined, confusing
  })
  socket.emit('generateImage',postObject,upscale,facefix)
  dbWrite() // can we gracefully recover if we restart right after sending the request to backend?
  //debugLog('sent request',postObject,upscale,facefix)
}

async function addRenderApi(id){
  time('addRenderApi')
  var job=queue[queue.findIndex(x=>x.id===id)]
  var initimg=null
  job.status='rendering'
  if(job.attachments[0]&&job.attachments[0].content_type&&job.attachments[0].content_type.startsWith('image')){
    log('fetching attachment from '.bgRed + job.attachments[0].proxy_url)
    time('get attachment')
    await axios.get(job.attachments[0].proxy_url,{responseType: 'arraybuffer'})
      .then(res=>{initimg = Buffer.from(res.data)})
      .catch(err=>{ console.error('unable to fetch url: ' + job.attachments[0].proxy_url); console.error(err) })
    timeEnd('get attachment')
  }
  if (initimg!==null){
    debugLog('uploadInitialImage')
    time('upload image to invokeai')
    let form = new FormData()
    form.append("data",JSON.stringify({kind:'init'}))
    form.append("file",initimg,{contentType:'image/png',filename:job.id+'.png'})
    function getHeaders(form) {
      return new Promise((resolve, reject) => {
          form.getLength((err, length) => {
              if(err) { reject(err) }
              let headers = Object.assign({'Content-Length': length}, form.getHeaders())
              resolve(headers)
           })
      })
    }
    getHeaders(form).then((headers)=>{
      return axios.post(config.apiUrl+'/upload',form, {headers:headers})
    }).then((response)=>{
      timeEnd('upload image to invokeai')
      // also have template width, height,mtime,thumbnail in response
      job.init_img=invokePath+'/'+response.data.url.replace('outputs/','')
      job.initimg=null
      emitRenderApi(job)
    }).catch((error) => console.error(error))
  }else{emitRenderApi(job)}
  timeEnd('addRenderApi')
}

var tf=null;var nsfwjs=null // declare globally
loadnsfwjs = async()=>{
  log('loading nsfwjs')
  tf = await import('@tensorflow/tfjs-node') //update globals
  nsfwjs = await import('nsfwjs')
  tf.enableProdMode()
}

loadtopggposter = async()=>{ // autopost server count to top.gg every 30 mins if changed
  const { AutoPoster } = require('topgg-autoposter') // todo write our own minimalist topgg client
  const topggStatPoster = AutoPoster(config.topggKey, bot)
  topggStatPoster.on('posted', (stats) => {log(`Posted stats to Top.gg | ${stats.serverCount} servers`)})
  topggStatPoster.on('error', (err) => {log(err)})
  // const Topgg = require("@top-gg/sdk") // https://topgg.js.org/classes/api#getVotes
  // topggVotes = await Topgg.getVotes() // get users who voted for bot
}

var Stripe=null;var strip=null
loadstripe = async()=>{
  Stripe = require('stripe')
  stripe=Stripe(config.stripeKey)
}

getStats = async(channel,unit=30,period="days",max=10)=>{
  var topUsers = []; var topChannels = []; var c=0; var r=0; var awards=[]; cburned=0
  max = Math.min(50,max) // cap to max 50
  for (var j of queue) { // loop all jobs in queue
    try{if(moment().diff(moment(j.timestampRequested),period)>unit)continue}catch(e){log(e)} // check timestamp within range, skip if not
    c=c+j.number // add jobs to count
    userindex=topUsers.findIndex(u=>u.id===j.userid) // find index of user in user db
    if(userindex===-1){topUsers.push({'id':j.userid, 'count':j.number, 'username':j.username});userindex=topUsers.findIndex(u=>u.id===j.userid)} // if user not in stat count, add them and find index
    topUsers[userindex].count = topUsers[userindex].count + j.number // add renders to users count
    if(topUsers[userindex].username!==j.username)topUsers[userindex].username=j.username // display most recent username
    channelindex=topChannels.findIndex(c=>c.id===j.channel) // find job channel
    if(topChannels.findIndex(c=>c.id===j.channel)===-1){topChannels.push({'id':j.channel, 'count':1});channelindex=topChannels.findIndex(c=>c.id===j.channel)} // if not in stat count, add them and find index
    topChannels[channelindex].count = topChannels[channelindex].count+1 // add renders to channel count
    if(!creditsDisabled){
      cburned=(parseFloat(cburned)+parseFloat(j.cost)*parseInt(j.number)).toFixed(3)
    } // calculate burned credits for period
  }
  // todo calculate coin purchase stats, buys in time period
  //for (var p of payments){} // txid can be txid,transfer,free,manual
  var response='\n**'+tidyNumber(c)+'** jobs in **'+bot.guilds.size+'** guilds in the last :stopwatch: **'+unit+' '+period+'**'
  var topxUsers = topUsers.sort((b,a)=>a.count-b.count).slice(0,max)
  response+='\n**Top '+topxUsers.length+'** :artist: users of **'+topUsers.length+'** active'
  awards=[':first_place:',':second_place:',':third_place:',':cookie:']
  topxUsers.forEach(u=>{
    response+='\n**'+tidyNumber(u.count)+'** '
    if(awards[r])response+=awards[r]
    response+=' '+u.username
    r++
  })
  var topxChannels = topChannels.sort((b,a)=>a.count-b.count).slice(0,max)
  response+='\n\n**Top '+topxChannels.length+'** :door: channels of **'+topChannels.length+'** active'
  var txc=[]
  await topxChannels.forEach(async c=>{
    var channel = await bot.getChannel(c.id)
    var cn = channel?.name ? channel.name : c.id
    txc.push({renders:c.count,channel:cn,guild:channel?.guild?channel?.guild?.name:'DM'})
  })
  r=0
  txc.sort((b,a)=>a.count-b.count).forEach((t)=>{
    response+='\n**'+tidyNumber(t.renders)+'** '
    if(awards[r])response+=awards[r]
    response+=' *'+t.channel+'* in **'+t.guild+'**'
    r++
  })
  //var topguilds = bot.guilds//.sort((a, b) => a.memberCount - b.memberCount).slice(0,max)
  //response+='\nTop Guild is **'+topguilds[0].name+'** with **'+topguilds[0].memberCount+'** members'
  if(!creditsDisabled){
    var totalc=0
    var totalcusers=0
    var totalc100=0
    var totalc100users=0
    var cusd=1/500
    users.forEach(async u=>{
      c=parseFloat(u.credits)
      totalc+=c
      totalcusers++
      if(c>100){totalc100+=c;totalc100users++}
    })
    var hodlers = users.filter(u=>u.credits>100).sort((a,b)=>b.credits-a.credits).slice(0,max)
    response+='\n\n**Top '+max+'** :coin: hodlers of **'+totalcusers+'**'
    r=0
    hodlers.forEach(async u=>{
      let userjob=queue.find(q=>q.userid===u.id)
      let un= userjob ? userjob.username : u.id
      response+='\n**'+tidyNumber(u.credits)+'** '
      if(awards[r])response+=awards[r]
      response+=' '+un
      r++
    })
    var percentPaid=(totalc/totalc100).toFixed(2)
    response+='\n\n**All** :coin: **'+tidyNumber(totalc.toFixed(2))+'** :moneybag: $**'+tidyNumber((totalc*cusd).toFixed(2))+'** usd :artist: **'+tidyNumber(totalcusers)+'** hodlers'
    response+='\n**Only** :coin: **>100** : **'+tidyNumber(totalc100.toFixed(2))+'** :moneybag: $**'+tidyNumber((totalc100*cusd).toFixed(2))+'** usd :artist: **'+tidyNumber(totalc100users)+'** hodlers'
    response+='\n:coin: **'+tidyNumber(cburned)+'** :moneybag: $**'+(cburned*cusd).toFixed(2)+'** usd burned in last :stopwatch: **'+unit+' '+period+'**'
    //response+='\nApprox '+percentPaid+'% paid :coin:'
  }
  if(txc.length>0){
    sliceMsg2(response).forEach(r=>{bot.createMessage(channel,r).then().catch(e=>{log(e)})})
  }else{bot.createMessage(channel,'No results found for time period `'+unit+' '+period+'`\nTry `!stats 1 day`').then().catch(e=>{log(e)})}
}
getStats=debounce(getStats,10000,true)

generateStripeLink = async(id)=>{
    var paymentLink = await stripe.paymentLinks.create({line_items: [{price: config.stripePriceId,quantity: 1}],metadata:{discord_id:id}})
    return paymentLink.url
}

getStripePayments = async()=>{
    var stripeEvents = await stripe.events.list({limit:5,types:['checkout.session.completed']})
    stripeEvents.data.forEach(async e=>{
        if(e.data.object.payment_status==='paid'&&e.data.object.status==='complete'&&e.data.object.mode==='payment'){
            var pastPayment=payments.find(x=>x.txid===e.data.object.id)
            if(pastPayment===undefined){
              var discordid=parseInt(e.data.object.metadata.discord_id)
              amountCredit=(e.data.object.amount_total/100)*500
              log('New Payment! credits:'.bgBrightGreen.red+amountCredit+' for '+e.data.object.amount_total/100+' '+e.data.object.currency)
              log('checkout session id '+e.data.object.id) // use for payments db txid
              log('email '+e.data.object.customer_details?.email+' name '+e.data.object.customer_details?.name)
              log('discord id: '+discordid)
              creditRecharge(amountCredit,e.data.object.id,String(discordid),e.data.object.amount_total/100+' '+e.data.object.currency)
            }
        }
    })
}

msgToJob = async(msg)=>{
  if(msg.attachments.length>0&&msg.attachments[0].proxy_url){
    time(msgToJob)
    meta = await ExifReader.load(msg.attachments[0].proxy_url)
    dream = meta.dream
    if(meta.dream){log(meta.dream)}
    timeEnd(msgToJob)
  }
}

reloadConfig = async()=>{
  log('reloading config')
  config = fs.existsSync('./config/.env') ? require('dotenv').config({ path:'./config/.env'}).parsed : require('dotenv').config().parsed
  if (!config||!config.apiUrl||!config.basePath||!config.channelID||!config.adminID||!config.discordBotKey||!config.pixelLimit||!config.fileWatcher||!config.samplers) { throw('Please re-read the setup instructions at https://github.com/ausbitbank/stable-diffusion-discord-bot , you are missing the required .env configuration file or options') }
  if(config.nsfwChecksEnabled==="true"){config.nsfwChecksEnabled=true}else{config.nsfwChecksEnabled=false}
  if(config.creditsDisabled==='true'){creditsDisabled=true}else{creditsDisabled=false}
  if(config.showFilename==='true'){showFilename=true}else{showFilename=false}
  if(config.showPreviews==='true'){showPreviews=true}else{showPreviews=false}
  if(config.showRenderSettings==='true'){showRenderSettings=true}else{showRenderSettings=false}
  if(config.statsAdminOnly==='true'){statsAdminOnly=true}else{statsAdminOnly=false}
  if(config.deleteAfterPost==='true'){deleteAfterPost=true}else{deleteAfterPost=false}
  defaultSize = parseInt(config.defaultSize)||512
  defaultSteps = parseInt(config.defaultSteps)||50
  defaultScale = parseFloat(config.defaultScale)||7.5
  defaultStrength = parseFloat(config.defaultStrength)||0.45
  maxSteps = parseInt(config.maxSteps)||100
  maxIterations = parseInt(config.maxIterations)||10
  defaultMaxDiscordFileSize=parseInt(config.defaultMaxDiscordFileSize)||25000000
  basePath = config.basePath
  invokePath = config.invokePath ? config.invokePath : config.basePath
  maxAnimateImages = 100 // Only will fetch most recent X images for animating
  allGalleryChannels = fs.existsSync('./config/dbGalleryChannels.json') ? JSON.parse(fs.readFileSync('./config/dbGalleryChannels.json', 'utf8')) : {}
  allNSFWChannels = fs.existsSync('./config/dbNSFWChannels.json') ? JSON.parse(fs.readFileSync('./config/dbNSFWChannels.json', 'utf8')) : {}
  nsfwWords=config.nsfwWords?.split(',')||['sex','nude','nudity','nsfw','naked','porn','fuck']
  if(config.nsfwWords&&config.nsfwWords===''){nsfwWords=[]}
  rembg=config.rembg||'http://127.0.0.1:5000?url='
  defaultModel=config.defaultModel||'stable-diffusion-1.5'
  currentModel='notInitializedYet'
  defaultModelInpaint=config.defaultModelInpaint||'inpainting'
  defaultInpaintPrompt=config.defaultInpaintPrompt||'amazing'
  defaultInpaintStrength=parseFloat(config.defaultInpaintStrength)||0.75
  samplers=config.samplers.split(',')

}

main = async()=>{
  if(config.nsfwChecksEnabled) loadnsfwjs() // only load if needed
  await bot.connect()
  if(config.topggKey&&config.topggKey.length>0){loadtopggposter()}
  if(config.allowStripePayments==="true"&&config.stripeKey.length>0){loadstripe()}
  if(!models){socket.emit('requestSystemConfig')}
  socket.emit("getLoraModels")
  socket.emit("getTextualInversionTriggers")
  //spinner = await fsPromises.readFile(spinnerFilename,'utf8') // load into memory once only

}
// Actual start of execution flow
main()
