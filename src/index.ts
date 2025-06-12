import express from "express";
import cors from "cors";
import { config } from "./config";
import { indexRouter } from "./routes";
import { resumeAllUnfinishedBoosts } from "./lib/allChainUtils";
// import { resumeAllUnfinishedBoosts } from "./lib/evmMain";

const app = express();
const port = config.PORT;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

indexRouter(app);

app.get("/", (req, res) => {
  console.log("server is running!");
  res.send("server is running!")
});


app.listen(port, () => {
  console.log(`Express started on http://localhost:${port}`);
  resumeAllUnfinishedBoosts()
});

