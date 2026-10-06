using FastJson.Serializer.Pro;

var invoice = new { Id = 42, Total = 19.99m };
Console.WriteLine(FastJsonSerializer.Serialize(invoice));
