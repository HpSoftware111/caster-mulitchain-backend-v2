import { mainRouter } from "./mainRouter";


export const indexRouter = (app : any) => {
    app.use("/api", mainRouter);
}