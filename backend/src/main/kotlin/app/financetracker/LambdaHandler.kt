package app.financetracker

import com.amazonaws.serverless.proxy.internal.LambdaContainerHandler
import com.amazonaws.serverless.proxy.model.AwsProxyResponse
import com.amazonaws.serverless.proxy.model.HttpApiV2ProxyRequest
import com.amazonaws.serverless.proxy.spring.SpringBootLambdaContainerHandler
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestStreamHandler
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.ObjectNode
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream

/**
 * Entry point on AWS Lambda (function URL, payload format 2.0). The Spring context starts while the
 * class loads, which is the part SnapStart snapshots, so a cold start resumes an already started app.
 * Locally and in tests the app still runs on Tomcat through main().
 */
class LambdaHandler : RequestStreamHandler {
    override fun handleRequest(input: InputStream, output: OutputStream, context: Context) {
        val containerOutput = ByteArrayOutputStream()
        springHandler.proxyStream(input, containerOutput, context)
        jsonMapper.writeValue(output, toFunctionUrlResponse(jsonMapper.readTree(containerOutput.toByteArray())))
    }

    companion object {
        private val jsonMapper = JsonMapper.builder().build()

        private val springHandler: SpringBootLambdaContainerHandler<HttpApiV2ProxyRequest, AwsProxyResponse> = run {
            // Responses without a charset (the UI's .js and .css files) were turned into text as ISO-8859-1,
            // garbling every non-ASCII character in them; the broken JavaScript left a black page.
            LambdaContainerHandler.getContainerConfig().defaultContentCharset = Charsets.UTF_8.name()
            SpringBootLambdaContainerHandler.getHttpApiV2ProxyHandler(FinanceTrackerApplication::class.java)
        }

        /**
         * The container answers in the 1.0 shape (multiValueHeaders). Function URLs read the 2.0 shape,
         * which ignores multiValueHeaders and takes cookies only from a top-level `cookies` array, so
         * without this only one Set-Cookie survived and the session cookie was lost (a sign-in loop).
         */
        fun toFunctionUrlResponse(containerResponse: JsonNode): ObjectNode {
            val functionUrlResponse = jsonMapper.createObjectNode()
            functionUrlResponse.put("statusCode", containerResponse["statusCode"].asInt())
            val headers = functionUrlResponse.putObject("headers")
            val cookies = functionUrlResponse.putArray("cookies")
            val headerValues = linkedMapOf<String, MutableList<String>>()
            containerResponse["multiValueHeaders"]?.properties()?.forEach { (name, values) ->
                headerValues.getOrPut(name) { mutableListOf() } += values.values().map { value -> value.asString() }
            }
            containerResponse["headers"]?.properties()?.forEach { (name, value) ->
                if (name !in headerValues) headerValues[name] = mutableListOf(value.asString())
            }
            headerValues.forEach { (name, values) ->
                if (name.equals("Set-Cookie", ignoreCase = true)) values.distinct().forEach { cookie -> cookies.add(cookie) }
                else headers.put(name, values.joinToString(","))
            }
            containerResponse["body"]?.takeUnless { it.isNull }?.let { body -> functionUrlResponse.put("body", body.asString()) }
            functionUrlResponse.put("isBase64Encoded", containerResponse["isBase64Encoded"]?.asBoolean() ?: false)
            return functionUrlResponse
        }
    }
}
