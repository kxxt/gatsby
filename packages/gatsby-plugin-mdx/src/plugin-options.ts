import type { ProcessorOptions } from "@mdx-js/mdx"
import type { GatsbyCache, NodePluginArgs, PluginOptions } from "gatsby"
import deepmerge from "deepmerge"
import type { IPluginRefObject } from "gatsby-plugin-utils/types"
import { getSourcePluginsAsRemarkPlugins } from "./get-source-plugins-as-remark-plugins"
import rehypeMdxMetadataExtractor from "./rehype-metadata-extractor"
import { remarkMdxHtmlPlugin } from "./remark-mdx-html-plugin"
import { remarkPathPlugin } from "./remark-path-prefix-plugin"

export interface IMdxPluginOptions {
  extensions: [string]
  mdxOptions: ProcessorOptions
  gatsbyRemarkPlugins?: [IPluginRefObject]
}
interface IHelpers {
  getNode: NodePluginArgs["getNode"]
  getNodesByType: NodePluginArgs["getNodesByType"]
  pathPrefix: NodePluginArgs["pathPrefix"]
  reporter: NodePluginArgs["reporter"]
  cache: GatsbyCache
}
type MdxDefaultOptions = (pluginOptions: PluginOptions) => IMdxPluginOptions

export const defaultOptions: MdxDefaultOptions = pluginOptions => {
  const mdxOptions: ProcessorOptions = {
    format: `mdx`,
    useDynamicImport: true,
    providerImportSource: `@mdx-js/react`,
    jsxRuntime: `classic`,
  }
  const defaults = {
    extensions: [`.mdx`],
    mdxOptions,
  }
  const options = deepmerge(
    defaults,
    pluginOptions
  ) as unknown as IMdxPluginOptions

  return options
}

type EnhanceMdxOptions = (
  pluginOptions: PluginOptions,
  helpers: IHelpers
) => Promise<ProcessorOptions>

export const enhanceMdxOptions: EnhanceMdxOptions = async (
  pluginOptions,
  helpers
) => {
  const options = defaultOptions(pluginOptions)

  if (!options.mdxOptions.remarkPlugins) {
    options.mdxOptions.remarkPlugins = []
  }

  // Inject Gatsby path prefix if needed
  if (helpers.pathPrefix) {
    options.mdxOptions.remarkPlugins.push([
      remarkPathPlugin,
      { pathPrefix: helpers.pathPrefix },
    ])
  }

  // Support gatsby-remark-* plugins
  if (
    options.gatsbyRemarkPlugins &&
    Object.keys(options.gatsbyRemarkPlugins).length
  ) {
    if (!options.mdxOptions.remarkPlugins) {
      options.mdxOptions.remarkPlugins = []
    }

    // Parser plugins
    for (const plugin of options.gatsbyRemarkPlugins) {
      const requiredPlugin = plugin.module

      if (typeof requiredPlugin.setParserPlugins === `function`) {
        for (const parserPlugin of requiredPlugin.setParserPlugins(
          plugin.options || {}
        )) {
          if (Array.isArray(parserPlugin)) {
            const [parser, parserPluginOptions] = parserPlugin
            options.mdxOptions.remarkPlugins.push([parser, parserPluginOptions])
          } else {
            options.mdxOptions.remarkPlugins.push(parserPlugin)
          }
        }
      }
    }

    // Transformer plugins
    const gatsbyRemarkPlugins = await getSourcePluginsAsRemarkPlugins({
      gatsbyRemarkPlugins: options.gatsbyRemarkPlugins,
      ...helpers,
    })
    if (gatsbyRemarkPlugins) {
      options.mdxOptions.remarkPlugins.push(...gatsbyRemarkPlugins)
    }
  }

  options.mdxOptions.remarkPlugins.push(remarkMdxHtmlPlugin)

  if (!options.mdxOptions.rehypePlugins) {
    options.mdxOptions.rehypePlugins = []
  }

  // Extract metadata generated from by rehype-infer-* and similar plugins
  options.mdxOptions.rehypePlugins.push(rehypeMdxMetadataExtractor)

  return options.mdxOptions
}