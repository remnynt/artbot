require('dotenv').config()
const deburr = require('lodash.deburr')
const Web3 = require('web3')
const ProjectBot = require('./ProjectBot').ProjectBot
const getArtBlocksProjects =
  require('../Utils/parseArtBlocksAPI').getArtBlocksProjects
const getArtBlocksOpenProjects =
  require('../Utils/parseArtBlocksAPI').getArtBlocksOpenProjects
const web3 = new Web3(Web3.givenProvider || 'ws://localhost:8545')

// Refresh takes around one minute, so recommend setting this to 60 minutes
const METADATA_REFRESH_INTERVAL_MINUTES =
  process.env.METADATA_REFRESH_INTERVAL_MINUTES

// RandomBot Stuff
const RANDOM_ART_AMOUNT = 10
const RANDOM_ART_TIME = new Date()
RANDOM_ART_TIME.setHours(8)
RANDOM_ART_TIME.setMinutes(0)
RANDOM_ART_TIME.setSeconds(0)
RANDOM_ART_TIME.setMilliseconds(0)

class ArtIndexerBot {
  constructor(projectFetch = getArtBlocksProjects) {
    this.projectFetch = projectFetch
    this.projects = {}
    this.init()
  }

  /**
   * Initialize async aspects of the FactoryBot
   */
  async init() {
    await this.buildProjectBots()

    setInterval(async () => {
      await this.buildProjectBots()
    }, METADATA_REFRESH_INTERVAL_MINUTES * 60000)
  }

  async buildProjectBots() {
    try {
      const projects = await this.projectFetch()
      for (let i = 0; i < projects.length; i++) {
        const project = projects[i]
        console.log(
          `Refreshing project cache for Project ${project.projectId} ${project.name}`
        )
        const newBot = new ProjectBot({
          projectNumber: project.projectId,
          coreContract: project.contract.id,
          editionSize: project.invocations,
          projectName: project.name,
          projectActive: project.active,
        })
        const projectKey = this.toProjectKey(project.name)
        this.projects[projectKey] = newBot
      }
    } catch (err) {
      console.error(`Error while initializing ArtIndexerBots\n${err}`)
    }
  }

  async handleNumberMessage(msg) {
    const content = msg.content

    if (content.length <= 1) {
      msg.channel.send(
        `Invalid format, enter # followed by the piece number of interest.`
      )
      return
    }

    let projectKey = this.toProjectKey(
      content.substr(content.indexOf(' ') + 1).replace('?details', '')
    )

    // if '#?' message, get random project
    if (projectKey === '#?') {
      return this.sendRandomProjectRandomTokenMessage(msg)
    } else if (projectKey === 'open') {
      return this.sendRandomOpenProjectRandomTokenMessage(msg)
    }

    console.log(`Searching for project ${projectKey}`)
    const projBot = this.projects[projectKey]
    // TODO: handle PBAB projects (e.g. #? Plottables)
    if (projBot) {
      projBot.handleNumberMessage(msg)
    }
  }

  toProjectKey(projectName) {
    const projectKey = deburr(projectName)
      .toLowerCase()
      .replace(/[^a-z0-9]/gi, '')

    // just in case there's a project name with no alphanumerical characters
    if (projectKey === '') {
      return deburr(projectName).toLowerCase().replace(/\s+/g, '')
    }

    return projectKey
  }

  async startRandomRoutine(channel) {
    let msg = {}
    msg.content = '#?'
    msg.channel = channel
    // Try to message(s) in #ab-art-chat every minute
    setInterval(() => this.sendRandomProjectRandomTokenMessage(msg), 1 * 60000)
  }

  // This function takes a channel and sends a message containing a random
  // token from a random project
  async sendRandomProjectRandomTokenMessage(msg) {
    let now = new Date()
    // Only send message if hour and minute match up with specified time
    if (
      now.getHours() !== RANDOM_ART_TIME.getHours() ||
      now.getMinutes() !== RANDOM_ART_TIME.getMinutes()
    ) {
      return
    }

    let attempts = 0
    while (attempts < 10) {
      const keys = Object.keys(this.projects)
      let projectKey = keys[Math.floor(Math.random() * keys.length)]
      let projBot = this.projects[projectKey]
      if (projBot && projBot.editionSize > 1 && projBot.projectActive) {
        console.log(
          `Sending ${RANDOM_ART_AMOUNT} random pieces for ${projectKey}!`
        )

        for (let i = 0; i < RANDOM_ART_AMOUNT; i++) {
          projBot.handleNumberMessage(msg)
        }
        return
      }
      attempts++
    }
  }

  // This function takes a channel and sends a message containing a random
  // token from a random open project
  async sendRandomOpenProjectRandomTokenMessage(msg) {
    let attempts = 0
    while (attempts < 10) {
      const openProjects = await getArtBlocksOpenProjects()

      let project =
        openProjects[Math.floor(Math.random() * openProjects.length)]

      let projBot = this.projects[this.toProjectKey(project.name)]
      if (projBot && projBot.editionSize > 1 && projBot.projectActive) {
        return projBot.handleNumberMessage(msg)
      }
      attempts++
    }
  }
}

module.exports.ArtIndexerBot = ArtIndexerBot
